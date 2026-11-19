import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type, type Part } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const COOKIE_NAME = 'tavily_auth_session';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(process.env.GEMINI_API_KEY || 'tavily-local-dev-secret').digest('hex');

interface AuthUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  provider: 'google' | 'phone';
}

interface AttachmentPayload {
  id: string;
  name: string;
  mimeType: string;
  kind: 'image' | 'document';
  size: number;
  dataUrl?: string;
  textContent?: string;
}

interface PendingOtp {
  code: string;
  name: string;
  expiresAt: number;
}

const pendingOtps = new Map<string, PendingOtp>();
const userSessionsStore = new Map<string, unknown[]>();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Add it in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}

function signUserCookie(user: AuthUser): string {
  const payload = Buffer.from(JSON.stringify(user), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyUserCookie(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthUser;
  } catch {
    return null;
  }
}

function setAuthCookie(res: express.Response, user: AuthUser) {
  const token = signUserCookie(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return urlStr.toLowerCase();
  }
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/\d/g, '•')}${phone.slice(-4)}`;
}

function buildAttachmentParts(attachments: AttachmentPayload[] = []): Part[] {
  const parts: Part[] = [];
  for (const att of attachments.slice(0, 6)) {
    if (att.dataUrl && att.dataUrl.includes(',')) {
      const [meta, base64] = att.dataUrl.split(',', 2);
      const mimeMatch = meta.match(/data:([^;]+);base64/);
      const mimeType = mimeMatch?.[1] || att.mimeType || 'application/octet-stream';
      if (base64) {
        parts.push({
          inlineData: {
            mimeType,
            data: base64,
          },
        });
      }
    } else if (att.textContent) {
      parts.push({
        text: `[Attached Document: ${att.name}]\n${att.textContent.slice(0, 20000)}`,
      });
    }
  }
  return parts;
}

function getTimeRangeInstruction(timeRange: string): string {
  switch (timeRange) {
    case 'day':
      return 'Prioritize results and developments from the past 24 hours.';
    case 'week':
      return 'Prioritize results and developments from the past 7 days.';
    case 'month':
      return 'Prioritize results and developments from the past 30 days.';
    case 'year':
      return 'Prioritize results and developments from the past 12 months.';
    default:
      return '';
  }
}

function getFormatInstruction(format: string): string {
  switch (format) {
    case 'comparison_matrix':
      return 'Emphasize structured side-by-side comparison tables, metrics, pros/cons, and explicit trade-offs across options.';
    case 'technical_deep_dive':
      return 'Provide rigorous technical depth covering architecture, specifications, benchmarks, implementation constraints, and failure modes.';
    case 'action_plan':
      return 'Prioritize concrete execution steps, sequencing, risk mitigation, ownership, and measurable next actions.';
    default:
      return 'Provide a crisp, executive-ready analytical brief with clear evidence, quantitative metrics, and practical takeaways.';
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const retryable =
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('500') ||
      msg.includes('UNAVAILABLE');
    if (retries > 0 && retryable) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return withRetry(fn, retries - 1);
    }
    throw err;
  }
}

interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Auth Routes
  app.get('/api/auth/me', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const user = verifyUserCookie(cookies[COOKIE_NAME]);
    res.json({ user });
  });

  app.post('/api/auth/google', (req, res) => {
    const { name, email } = req.body as { name?: string; email?: string };
    if (!name?.trim() || !email?.trim()) {
      res.status(400).json({ error: 'Name and email are required.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const user: AuthUser = {
      id: `google_${crypto.createHash('sha1').update(cleanEmail).digest('hex').slice(0, 12)}`,
      name: name.trim(),
      email: cleanEmail,
      provider: 'google',
    };
    setAuthCookie(res, user);
    res.json({ user });
  });

  app.post('/api/auth/phone/send-otp', (req, res) => {
    const { name, phone } = req.body as { name?: string; phone?: string };
    if (!name?.trim() || !phone?.trim()) {
      res.status(400).json({ error: 'Name and phone number are required.' });
      return;
    }
    const cleanPhone = phone.trim();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    pendingOtps.set(cleanPhone, {
      code,
      name: name.trim(),
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    res.json({
      ok: true,
      phone: cleanPhone,
      maskedPhone: maskPhone(cleanPhone),
      previewCode: code,
    });
  });

  app.post('/api/auth/phone/verify-otp', (req, res) => {
    const { phone, code, name } = req.body as {
      phone?: string;
      code?: string;
      name?: string;
    };
    if (!phone?.trim() || !code?.trim()) {
      res.status(400).json({ error: 'Phone number and verification code are required.' });
      return;
    }
    const pending = pendingOtps.get(phone.trim());
    if (!pending || pending.expiresAt < Date.now() || pending.code !== code.trim()) {
      res.status(400).json({ error: 'Invalid or expired verification code.' });
      return;
    }
    pendingOtps.delete(phone.trim());
    const user: AuthUser = {
      id: `phone_${crypto.createHash('sha1').update(phone.trim()).digest('hex').slice(0, 12)}`,
      name: name?.trim() || pending.name,
      phone: phone.trim(),
      provider: 'phone',
    };
    setAuthCookie(res, user);
    res.json({ user });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  // Session Storage Routes
  app.get('/api/sessions', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const user = verifyUserCookie(cookies[COOKIE_NAME]);
    if (!user) {
      res.json({ sessions: [] });
      return;
    }
    res.json({ sessions: userSessionsStore.get(user.id) || [] });
  });

  app.post('/api/sessions', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const user = verifyUserCookie(cookies[COOKIE_NAME]);
    if (!user) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }
    const { session } = req.body as { session?: { id?: string } };
    if (!session?.id) {
      res.status(400).json({ error: 'Invalid session payload.' });
      return;
    }
    const current = (userSessionsStore.get(user.id) as Array<{ id: string }>) || [];
    const updated = [session, ...current.filter((s) => s.id !== session.id)].slice(0, 30);
    userSessionsStore.set(user.id, updated);
    res.json({ ok: true });
  });

  app.delete('/api/sessions/:id', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const user = verifyUserCookie(cookies[COOKIE_NAME]);
    if (!user) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }
    const targetId = req.params.id;
    const current = (userSessionsStore.get(user.id) as Array<{ id: string }>) || [];
    userSessionsStore.set(
      user.id,
      current.filter((s) => s.id !== targetId)
    );
    res.json({ ok: true });
  });

  // Streaming Research Agent Pipeline
  app.post('/api/research/stream', async (req, res) => {
    const {
      query,
      depth = 'standard',
      timeRange = 'any',
      format = 'executive_brief',
      includeDomains = [],
      excludeDomains = [],
      attachments = [],
    } = req.body as {
      query?: string;
      depth?: 'quick' | 'standard' | 'deep';
      timeRange?: string;
      format?: string;
      includeDomains?: string[];
      excludeDomains?: string[];
      attachments?: AttachmentPayload[];
    };

    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'Please provide a research query.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const sendEvent = (event: string, data: unknown) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const startedAt = Date.now();

    try {
      const ai = getGeminiClient();
      const subQueryCount = depth === 'quick' ? 2 : depth === 'deep' ? 4 : 3;
      const cleanInclude = includeDomains
        .map((d) => d.trim().toLowerCase().replace(/^www\./, ''))
        .filter(Boolean);
      const cleanExclude = excludeDomains
        .map((d) => d.trim().toLowerCase().replace(/^www\./, ''))
        .filter(Boolean);
      const timeInstruction = getTimeRangeInstruction(timeRange);
      const formatInstruction = getFormatInstruction(format);
      const attachmentParts = buildAttachmentParts(attachments);

      // Step 1: Plan Research Queries
      const planStepId = 'step-plan';
      const planStart = Date.now();
      sendEvent('step', {
        id: planStepId,
        type: 'plan',
        title: 'Planning research vectors',
        detail: `Decomposing prompt into ${subQueryCount} targeted web search queries (${depth} depth).`,
        status: 'running',
        engine: 'gemini',
      });

      const planPrompt = [
        `You are an autonomous research planner. Today's date: ${new Date().toISOString().slice(0, 10)}.`,
        `Research query: "${query.trim()}"`,
        timeInstruction,
        cleanInclude.length > 0 ? `Prefer domains: ${cleanInclude.join(', ')}` : '',
        cleanExclude.length > 0 ? `Exclude domains: ${cleanExclude.join(', ')}` : '',
        `Create exactly ${subQueryCount} complementary, specific web search queries to thoroughly answer the user's question.`,
      ]
        .filter(Boolean)
        .join('\n');

      const planResp = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: attachmentParts.length > 0 ? { parts: [...attachmentParts, { text: planPrompt }] } : planPrompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                queries: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING },
                      angle: { type: Type.STRING },
                    },
                    required: ['query', 'angle'],
                  },
                },
              },
              required: ['queries'],
            },
          },
        })
      );

      let plannedQueries: Array<{ id: string; query: string; angle: string }> = [
        { id: 'search-1', query: query.trim(), angle: 'Primary Search' },
      ];
      try {
        const parsed = JSON.parse((planResp.text ?? '{}').trim()) as {
          queries?: Array<{ query: string; angle: string }>;
        };
        if (parsed.queries && parsed.queries.length > 0) {
          plannedQueries = parsed.queries.slice(0, subQueryCount).map((q, idx) => ({
            id: `search-${idx + 1}`,
            query: q.query,
            angle: q.angle,
          }));
        }
      } catch {
        // Fallback to direct query
      }

      sendEvent('step', {
        id: planStepId,
        type: 'plan',
        title: 'Research plan ready',
        detail: plannedQueries.map((q) => q.angle).join(' · '),
        status: 'completed',
        engine: 'gemini',
        durationMs: Date.now() - planStart,
      });

      // Step 2: Parallel Google Search Grounding
      const sourceMap = new Map<
        string,
        {
          id: number;
          title: string;
          url: string;
          domain: string;
          snippet?: string;
          extracted?: boolean;
        }
      >();
      let nextSourceId = 1;

      const isAllowed = (domain: string) =>
        !cleanExclude.some((ex) => domain === ex || domain.endsWith(`.${ex}`));

      const registerSource = (url: string, title: string, snippet?: string) => {
        const normalized = url.trim();
        if (!normalized) return null;
        const domain = extractDomain(normalized);
        if (!isAllowed(domain)) return null;
        const existing = sourceMap.get(normalized);
        if (existing) return existing;
        const entry = {
          id: nextSourceId++,
          title: title?.trim() || domain,
          url: normalized,
          domain,
          snippet,
          extracted: true,
        };
        sourceMap.set(normalized, entry);
        return entry;
      };

      const searchFindings: Array<{ angle: string; query: string; text: string }> = [];

      await Promise.all(
        plannedQueries.map(async (sq) => {
          if (closed) return;
          const sqStart = Date.now();
          sendEvent('step', {
            id: sq.id,
            type: 'search',
            title: sq.angle,
            detail: sq.query,
            status: 'running',
            engine: 'gemini',
          });

          try {
            const siteFilter =
              cleanInclude.length > 0
                ? ` (${cleanInclude.slice(0, 4).map((d) => `site:${d}`).join(' OR ')})`
                : '';

            const resp = await withRetry(() =>
              ai.models.generateContent({
                model: 'gemini-4-hydrogen',
                contents: `Search and gather factual evidence for: "${sq.query}${siteFilter}"\nContext: "${query.trim()}"\n${timeInstruction}\n\nProvide dense, verified facts, metrics, dates, and entity details found in search results.`,
                config: {
                  tools: [{ googleSearch: {} }],
                  thinkingConfig: {
                    thinkingLevel: depth === 'deep' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
                  },
                },
              })
            );

            const chunks =
              (resp.candidates?.[0]?.groundingMetadata?.groundingChunks as
                | GroundingChunk[]
                | undefined) || [];

            const bodyText = resp.text?.trim() || '';
            let countForQuery = 0;
            for (const chunk of chunks) {
              if (chunk.web?.uri) {
                const reg = registerSource(
                  chunk.web.uri,
                  chunk.web.title || extractDomain(chunk.web.uri),
                  bodyText.slice(0, 220)
                );
                if (reg) countForQuery++;
              }
            }

            searchFindings.push({
              angle: sq.angle,
              query: sq.query,
              text: bodyText,
            });

            sendEvent('sources', Array.from(sourceMap.values()));
            sendEvent('step', {
              id: sq.id,
              type: 'search',
              title: sq.angle,
              detail: sq.query,
              status: 'completed',
              engine: 'gemini',
              resultsCount: countForQuery,
              durationMs: Date.now() - sqStart,
            });
          } catch (err: unknown) {
            sendEvent('step', {
              id: sq.id,
              type: 'search',
              title: sq.angle,
              detail: err instanceof Error ? err.message : 'Search failed',
              status: 'error',
              engine: 'gemini',
              durationMs: Date.now() - sqStart,
            });
          }
        })
      );

      if (closed) return;

      // Step 3: Structured Report Synthesis
      const synthStepId = 'step-synth';
      const synthStart = Date.now();
      const allSources = Array.from(sourceMap.values());

      sendEvent('step', {
        id: synthStepId,
        type: 'synthesize',
        title: 'Synthesizing structured report',
        detail: `Cross-referencing ${allSources.length} verified sources into executive summary, findings, action plan, and evidence table.`,
        status: 'running',
        engine: 'gemini',
      });

      const sourceIndexText =
        allSources.length > 0
          ? allSources.map((s) => `[${s.id}] ${s.title} (${s.url})`).join('\n')
          : 'No external URLs returned.';

      const evidenceText = searchFindings
        .map((f) => `### ${f.angle} (${f.query})\n${f.text}`)
        .join('\n\n');

      const synthesisPrompt = [
        `Synthesize an authoritative, structured research report answering: "${query.trim()}"`,
        `Format guidance: ${formatInstruction}`,
        `Evidence gathered:\n${evidenceText}`,
        `Verified Sources Index:\n${sourceIndexText}`,
        `Rules:
- Cite claims inline using exact bracketed numbers like [1] or [2] matching the Verified Sources Index (1..${allSources.length}).
- Populate keyFindings with 3 to 5 clear, distinct takeaways and matching sourceIds.
- Populate recommendations with 3 to 5 actionable next steps (priority High/Medium/Low, ownerOrNextStep).
- Populate evidenceMatrix with 3 to 6 quantitative or comparative dimensions (dimension, summary, concise dataPoint).
- Write reportMarkdown with crisp headings (##), comparative Markdown tables where applicable, and inline citations [1], [2]. Do not repeat a raw reference list at the bottom of reportMarkdown.`,
      ].join('\n\n');

      const synthResp = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents:
            attachmentParts.length > 0
              ? { parts: [...attachmentParts, { text: synthesisPrompt }] }
              : synthesisPrompt,
          config: {
            thinkingConfig: {
              thinkingLevel: depth === 'deep' ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                executiveSummary: { type: Type.STRING },
                keyFindings: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      heading: { type: Type.STRING },
                      detail: { type: Type.STRING },
                      sourceIds: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                    },
                    required: ['heading', 'detail', 'sourceIds'],
                  },
                },
                recommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      action: { type: Type.STRING },
                      rationale: { type: Type.STRING },
                      priority: { type: Type.STRING },
                      ownerOrNextStep: { type: Type.STRING },
                    },
                    required: ['action', 'rationale', 'priority', 'ownerOrNextStep'],
                  },
                },
                evidenceMatrix: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      dimension: { type: Type.STRING },
                      summary: { type: Type.STRING },
                      dataPoint: { type: Type.STRING },
                    },
                    required: ['dimension', 'summary', 'dataPoint'],
                  },
                },
                reportMarkdown: { type: Type.STRING },
                openQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                suggestedFollowUps: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                'title',
                'executiveSummary',
                'keyFindings',
                'recommendations',
                'evidenceMatrix',
                'reportMarkdown',
                'openQuestions',
                'suggestedFollowUps',
              ],
            },
          },
        })
      );

      const rawReport = JSON.parse((synthResp.text ?? '{}').trim()) as {
        title?: string;
        executiveSummary?: string;
        keyFindings?: Array<{ heading: string; detail: string; sourceIds: number[] }>;
        recommendations?: Array<{
          action: string;
          rationale: string;
          priority: string;
          ownerOrNextStep: string;
        }>;
        evidenceMatrix?: Array<{ dimension: string; summary: string; dataPoint: string }>;
        reportMarkdown?: string;
        openQuestions?: string[];
        suggestedFollowUps?: string[];
      };

      const normalizedReport = {
        title: rawReport.title || query.trim(),
        executiveSummary: rawReport.executiveSummary || '',
        keyFindings: Array.isArray(rawReport.keyFindings) ? rawReport.keyFindings : [],
        recommendations: Array.isArray(rawReport.recommendations)
          ? rawReport.recommendations.map((rec, idx) => ({
              id: `rec-${Date.now()}-${idx}`,
              action: rec.action,
              rationale: rec.rationale,
              priority:
                rec.priority === 'High' || rec.priority === 'Low' ? rec.priority : 'Medium',
              ownerOrNextStep: rec.ownerOrNextStep,
              completed: false,
            }))
          : [],
        evidenceMatrix: Array.isArray(rawReport.evidenceMatrix) ? rawReport.evidenceMatrix : [],
        reportMarkdown: rawReport.reportMarkdown || '',
        openQuestions: Array.isArray(rawReport.openQuestions) ? rawReport.openQuestions : [],
        suggestedFollowUps: Array.isArray(rawReport.suggestedFollowUps)
          ? rawReport.suggestedFollowUps.slice(0, 3)
          : [],
      };

      sendEvent('step', {
        id: synthStepId,
        type: 'synthesize',
        title: 'Synthesis complete',
        detail: `Generated report with ${normalizedReport.keyFindings.length} key findings and ${normalizedReport.recommendations.length} action items.`,
        status: 'completed',
        engine: 'gemini',
        durationMs: Date.now() - synthStart,
      });

      sendEvent('complete', {
        report: normalizedReport,
        sources: allSources,
        engineUsed: 'gemini-search',
        durationMs: Date.now() - startedAt,
      });
      res.end();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Research execution failed.';
      sendEvent('error', { message });
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  // Follow-up endpoint
  app.post('/api/research/followup', async (req, res) => {
    try {
      const {
        question,
        report,
        sources = [],
        history = [],
        runLiveSearch = true,
        attachments = [],
      } = req.body as {
        question?: string;
        report?: { title?: string; executiveSummary?: string; reportMarkdown?: string };
        sources?: Array<{
          id: number;
          title: string;
          url: string;
          domain: string;
          snippet?: string;
        }>;
        history?: Array<{ role: string; content: string }>;
        runLiveSearch?: boolean;
        attachments?: AttachmentPayload[];
      };

      if (!question?.trim()) {
        res.status(400).json({ error: 'Follow-up question is required.' });
        return;
      }

      const ai = getGeminiClient();
      const attachmentParts = buildAttachmentParts(attachments);

      const historyText = history
        .slice(-6)
        .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
        .join('\n');

      const existingSourcesText = sources
        .map((s) => `[${s.id}] ${s.title} (${s.url})`)
        .join('\n');

      const promptText = [
        `Answer the user's follow-up question clearly and concisely with inline numeric citations [n].`,
        report ? `Existing Report Title: ${report.title}\nSummary: ${report.executiveSummary}\nDetails: ${(report.reportMarkdown || '').slice(0, 3500)}` : '',
        existingSourcesText ? `Existing Numbered Sources:\n${existingSourcesText}` : '',
        historyText ? `Recent Conversation:\n${historyText}` : '',
        `Follow-up question: "${question.trim()}"`,
        runLiveSearch
          ? 'Use live web search if needed for fresh facts; cite existing sources by their [n] number.'
          : 'Answer strictly from the existing report, sources, and any attached documents.',
      ]
        .filter(Boolean)
        .join('\n\n');

      const resp = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents:
            attachmentParts.length > 0
              ? { parts: [...attachmentParts, { text: promptText }] }
              : promptText,
          config: {
            ...(runLiveSearch ? { tools: [{ googleSearch: {} }] } : {}),
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          },
        })
      );

      const answer = resp.text?.trim() || 'No response generated.';
      const updatedSources = [...sources];
      const existingByUrl = new Map(updatedSources.map((s) => [s.url, s]));
      let nextId = updatedSources.reduce((m, s) => Math.max(m, s.id), 0) + 1;

      const chunks =
        (resp.candidates?.[0]?.groundingMetadata?.groundingChunks as
          | GroundingChunk[]
          | undefined) || [];

      const citations: number[] = [];
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          const uri = chunk.web.uri.trim();
          let entry = existingByUrl.get(uri);
          if (!entry) {
            entry = {
              id: nextId++,
              title: chunk.web.title || extractDomain(uri),
              url: uri,
              domain: extractDomain(uri),
            };
            existingByUrl.set(uri, entry);
            updatedSources.push(entry);
          }
          if (!citations.includes(entry.id)) {
            citations.push(entry.id);
          }
        }
      }

      // Also capture any existing [n] referenced in the answer
      const refMatches = answer.match(/\[(\d+)\]/g) || [];
      for (const m of refMatches) {
        const num = Number(m.slice(1, -1));
        if (updatedSources.some((s) => s.id === num) && !citations.includes(num)) {
          citations.push(num);
        }
      }

      res.json({
        answer,
        citations,
        sources: updatedSources,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Follow-up failed.';
      res.status(500).json({ error: msg });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tavily Research Agent server listening on http://localhost:${PORT}`);
  });
}

startServer();
