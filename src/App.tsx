import { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, Menu, Plus, ShieldCheck, X } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { EmptyHome } from './components/EmptyHome';
import { PromptDock } from './components/PromptDock';
import { ReportView } from './components/ReportView';
import { Sidebar } from './components/Sidebar';
import { SourcesDrawer } from './components/SourcesDrawer';
import type {
  AttachmentItem,
  AuthUser,
  FollowUpTurn,
  ResearchRequest,
  ResearchSession,
  ResearchSource,
  ResearchStep,
  StructuredReport,
} from './types/research';

const GUEST_STORAGE_KEY = 'tavily_research_sessions_guest_v1';

function getStorageKey(userId?: string): string {
  return userId ? `tavily_research_sessions_u_${userId}_v1` : GUEST_STORAGE_KEY;
}

function loadSessions(userId?: string): ResearchSession[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ResearchSession[];
    return Array.isArray(parsed)
      ? parsed.map((s) =>
          s.status === 'running'
            ? {
                ...s,
                status: 'error' as const,
                errorMessage: 'Research run was interrupted before completion.',
              }
            : s
        )
      : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ResearchSession[], userId?: string) {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(sessions.slice(0, 30)));
  } catch {
    // Ignore quota limits
  }
}

function buildMarkdownExport(session: ResearchSession): string {
  const { report, sources, request } = session;
  if (!report) return '';
  const lines: string[] = [
    `# ${report.title}`,
    '',
    `> Research Query: ${request.query}`,
    `> Format: ${request.format.replace(/_/g, ' ')} | Sources: ${sources.length}`,
    '',
    '## Executive Summary',
    '',
    report.executiveSummary,
    '',
  ];

  if (report.keyFindings.length > 0) {
    lines.push('## Key Findings', '');
    report.keyFindings.forEach((f, idx) => {
      const cites = f.sourceIds.map((id) => `[${id}]`).join(' ');
      lines.push(`### ${idx + 1}. ${f.heading} ${cites}`.trim(), '', f.detail, '');
    });
  }

  if (report.recommendations.length > 0) {
    lines.push('## Action Plan', '');
    report.recommendations.forEach((rec) => {
      const box = rec.completed ? 'x' : ' ';
      lines.push(
        `- [${box}] **${rec.action}** (${rec.priority} priority) — ${rec.rationale} *Next step: ${rec.ownerOrNextStep}*`
      );
    });
    lines.push('');
  }

  if (report.reportMarkdown) {
    lines.push(report.reportMarkdown, '');
  }

  if (sources.length > 0) {
    lines.push('## Sources', '');
    sources.forEach((s) => {
      lines.push(`- [${s.id}] [${s.title}](${s.url}) (${s.domain})`);
    });
  }

  return lines.join('\n');
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [sessions, setSessions] = useState<ResearchSession[]>(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'sources' | 'trace'>('sources');
  const [highlightedSourceId, setHighlightedSourceId] = useState<number | null>(null);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = (await res.json()) as { user?: AuthUser | null };
        if (data.user) {
          setUser(data.user);
          const sessRes = await fetch('/api/sessions');
          if (sessRes.ok) {
            const sessData = (await sessRes.json()) as { sessions?: ResearchSession[] };
            if (Array.isArray(sessData.sessions) && sessData.sessions.length > 0) {
              setSessions(sessData.sessions);
              saveSessions(sessData.sessions, data.user.id);
              return;
            }
          }
          setSessions(loadSessions(data.user.id));
        }
      } catch {
        // Offline / guest fallback
      }
    })();
  }, []);

  useEffect(() => {
    saveSessions(sessions, user?.id);
  }, [sessions, user?.id]);

  const syncSessionToServer = async (session: ResearchSession, currentUser: AuthUser | null) => {
    if (!currentUser) return;
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session }),
      });
    } catch {
      // Ignore network error
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;
  const isRunning = activeSession?.status === 'running';

  const updateSession = (
    id: string,
    updater: (prev: ResearchSession) => ResearchSession
  ) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? updater(s) : s)));
  };

  const handleAuthenticated = async (signedInUser: AuthUser) => {
    setUser(signedInUser);
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = (await res.json()) as { sessions?: ResearchSession[] };
        if (Array.isArray(data.sessions) && data.sessions.length > 0) {
          setSessions(data.sessions);
          return;
        }
      }
    } catch {
      // ignore
    }
    setSessions(loadSessions(signedInUser.id));
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setUser(null);
    setActiveSessionId(null);
    setSessions(loadSessions());
  };

  const handleStopResearch = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (activeSessionId) {
      updateSession(activeSessionId, (s) => ({
        ...s,
        status: s.report ? 'completed' : 'error',
        errorMessage: s.report ? undefined : 'Research stopped by user.',
        updatedAt: Date.now(),
      }));
    }
  };

  const handleStartResearch = async (req: ResearchRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let localSession: ResearchSession = {
      id: sessionId,
      request: req,
      status: 'running',
      steps: [],
      sources: [],
      followUps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setSessions((prev) => [localSession, ...prev]);
    setActiveSessionId(sessionId);
    setHighlightedSourceId(null);
    setDrawerTab('trace');

    try {
      const response = await fetch('/api/research/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let message = `Research request failed (${response.status})`;
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson.error) message = errJson.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleSseFrame = (frame: string) => {
        const lines = frame.split('\n');
        let eventName = 'message';
        const dataParts: string[] = [];
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataParts.push(line.slice(5).trim());
          }
        }
        if (dataParts.length === 0) return;

        let payload: unknown;
        try {
          payload = JSON.parse(dataParts.join('\n'));
        } catch {
          return;
        }

        if (eventName === 'step') {
          const step = payload as ResearchStep;
          const nextSteps = localSession.steps.some((st) => st.id === step.id)
            ? localSession.steps.map((st) => (st.id === step.id ? step : st))
            : [...localSession.steps, step];
          localSession = { ...localSession, steps: nextSteps, updatedAt: Date.now() };
          const snapshot = localSession;
          updateSession(sessionId, () => snapshot);
        } else if (eventName === 'sources') {
          const sources = payload as ResearchSource[];
          localSession = { ...localSession, sources, updatedAt: Date.now() };
          const snapshot = localSession;
          updateSession(sessionId, () => snapshot);
        } else if (eventName === 'complete') {
          const {
            report,
            sources,
            engineUsed,
            durationMs,
          } = payload as {
            report: StructuredReport;
            sources: ResearchSource[];
            engineUsed: string;
            durationMs: number;
          };
          localSession = {
            ...localSession,
            status: 'completed',
            report,
            sources,
            engineUsed,
            durationMs,
            updatedAt: Date.now(),
          };
          const snapshot = localSession;
          updateSession(sessionId, () => snapshot);
          setDrawerTab('sources');
          syncSessionToServer(snapshot, user);
        } else if (eventName === 'error') {
          const { message } = payload as { message?: string };
          localSession = {
            ...localSession,
            status: 'error',
            errorMessage: message || 'Research agent encountered an error.',
            updatedAt: Date.now(),
          };
          const snapshot = localSession;
          updateSession(sessionId, () => snapshot);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          if (frame.trim()) handleSseFrame(frame);
        }
      }
      if (buffer.trim()) handleSseFrame(buffer);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg =
        err instanceof Error ? err.message : 'Failed to connect to research agent.';
      updateSession(sessionId, (s) => ({
        ...s,
        status: 'error',
        errorMessage: msg,
        updatedAt: Date.now(),
      }));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  const handleCitationClick = (sourceId: number) => {
    setDrawerTab('sources');
    setHighlightedSourceId(sourceId);
    setDrawerOpen(true);
    setTimeout(() => {
      document
        .getElementById(`source-${sourceId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const handleToggleActionItem = (actionId: string) => {
    if (!activeSessionId) return;
    updateSession(activeSessionId, (s) => {
      if (!s.report) return s;
      const updated: ResearchSession = {
        ...s,
        updatedAt: Date.now(),
        report: {
          ...s.report,
          recommendations: s.report.recommendations.map((rec) =>
            rec.id === actionId ? { ...rec, completed: !rec.completed } : rec
          ),
        },
      };
      syncSessionToServer(updated, user);
      return updated;
    });
  };

  const handleSendFollowUp = async (
    question: string,
    runLiveSearch: boolean,
    attachments: AttachmentItem[] = []
  ) => {
    if (!activeSession || !activeSession.report) return;
    const targetId = activeSession.id;
    const cleanContent =
      question.trim() ||
      (attachments.length > 0
        ? `Analyze ${attachments.map((a) => a.name).join(', ')}`
        : '');

    const userTurn: FollowUpTurn = {
      id: `fu-u-${Date.now()}`,
      role: 'user',
      content: cleanContent,
      attachments,
      timestamp: Date.now(),
    };

    updateSession(targetId, (s) => ({
      ...s,
      followUps: [...s.followUps, userTurn],
      updatedAt: Date.now(),
    }));

    setIsFollowUpLoading(true);
    try {
      const resp = await fetch('/api/research/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: cleanContent,
          report: activeSession.report,
          sources: activeSession.sources,
          history: activeSession.followUps,
          runLiveSearch,
          attachments,
        }),
      });
      const data = (await resp.json()) as {
        answer?: string;
        citations?: number[];
        sources?: ResearchSource[];
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to process follow-up.');
      }

      const assistantTurn: FollowUpTurn = {
        id: `fu-a-${Date.now()}`,
        role: 'assistant',
        content: data.answer || '',
        citations: data.citations,
        timestamp: Date.now(),
      };

      updateSession(targetId, (s) => {
        const next: ResearchSession = {
          ...s,
          sources: data.sources ?? s.sources,
          followUps: [...s.followUps, assistantTurn],
          updatedAt: Date.now(),
        };
        syncSessionToServer(next, user);
        return next;
      });
    } catch (err) {
      const errTurn: FollowUpTurn = {
        id: `fu-err-${Date.now()}`,
        role: 'assistant',
        content:
          err instanceof Error
            ? `Unable to answer follow-up: ${err.message}`
            : 'Unable to answer follow-up.',
        timestamp: Date.now(),
      };
      updateSession(targetId, (s) => ({
        ...s,
        followUps: [...s.followUps, errTurn],
      }));
    } finally {
      setIsFollowUpLoading(false);
    }
  };

  const handleExportMd = () => {
    if (!activeSession?.report) return;
    const md = buildMarkdownExport(activeSession);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const slug = activeSession.report.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug || 'research-report'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleNewResearch = () => {
    if (isRunning && abortRef.current) {
      abortRef.current.abort();
    }
    setActiveSessionId(null);
    setHighlightedSourceId(null);
    setDrawerOpen(false);
  };

  const handleDeleteSession = async (id: string) => {
    if (id === activeSessionId) {
      handleNewResearch();
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (user) {
      try {
        await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {
        // ignore
      }
    }
  };

  const firstName = user?.name?.trim().split(/\s+/)[0] || '';

  return (
    <div className="h-[100dvh] flex galaxy-canvas text-slate-100 overflow-hidden relative">
      <div className="absolute inset-0 galaxy-stars z-0" aria-hidden="true" />

      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        searchFilter={searchFilter}
        onSearchFilterChange={setSearchFilter}
        onSelectSession={(id) => {
          setActiveSessionId(id);
          setHighlightedSourceId(null);
        }}
        onNewResearch={handleNewResearch}
        onDeleteSession={handleDeleteSession}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        user={user}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-w-0 flex flex-col h-full relative z-10">
        <header className="h-14 sm:h-16 bg-[#070B1A]/80 backdrop-blur-md border-b border-white/10 px-3 sm:px-6 flex items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open chat history"
              className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-300 hover:text-white rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0 lg:hidden">
              Tavily Research
            </span>
            <span className="hidden lg:inline text-sm font-medium text-slate-200 truncate max-w-md">
              {activeSession
                ? activeSession.report?.title || activeSession.request.query
                : 'Private Research Workspace'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {activeSession && (
              <button
                type="button"
                onClick={handleNewResearch}
                aria-label="New chat"
                className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-300 hover:text-white rounded-lg cursor-pointer"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}

            {activeSession && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-white/[0.06] border border-white/12 hover:bg-white/[0.12] rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-sky-400" />
                <span>Sources ({activeSession.sources.length})</span>
              </button>
            )}

            {activeSession?.report && (
              <button
                type="button"
                onClick={handleExportMd}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export .md</span>
              </button>
            )}

            {user ? (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-slate-100 bg-white/[0.07] border border-white/12 hover:bg-white/[0.12] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title={`Signed in privately as ${user.name}`}
              >
                <span className="w-5 h-5 rounded-full bg-sky-400/25 border border-sky-400/50 text-sky-200 text-[10px] font-bold flex items-center justify-center">
                  {firstName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline max-w-[110px] truncate">{firstName}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          {activeSession ? (
            <ReportView
              session={activeSession}
              onCitationClick={handleCitationClick}
              onOpenSourcesDrawer={() => {
                setDrawerTab('sources');
                setDrawerOpen(true);
              }}
              onToggleActionItem={handleToggleActionItem}
              onSelectFollowUpSuggestion={(q) => handleSendFollowUp(q, true, [])}
              onRetryResearch={() => handleStartResearch(activeSession.request)}
              isFollowUpLoading={isFollowUpLoading}
            />
          ) : (
            <EmptyHome user={user} onOpenAuthModal={() => setAuthModalOpen(true)} />
          )}
        </div>

        <PromptDock
          hasActiveReport={Boolean(activeSession?.report)}
          isRunning={Boolean(isRunning)}
          isFollowUpLoading={isFollowUpLoading}
          onStartResearch={handleStartResearch}
          onSendFollowUp={handleSendFollowUp}
          onStopResearch={handleStopResearch}
        />
      </div>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />

      {drawerOpen && activeSession && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-xs"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-[#070B1A] border-l border-white/10 h-full z-10 flex flex-col shadow-2xl">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
              <span className="font-display text-sm font-semibold text-slate-100">
                Sources & Research Steps
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close sources drawer"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <SourcesDrawer
                steps={activeSession.steps}
                sources={activeSession.sources}
                highlightedSourceId={highlightedSourceId}
                activeTab={drawerTab}
                onTabChange={setDrawerTab}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
