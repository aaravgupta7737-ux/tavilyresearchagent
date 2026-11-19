import { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Square,
} from 'lucide-react';
import {
  MarkdownWithCitations,
  renderInlineWithCitations,
} from './MarkdownWithCitations';
import type { AttachmentItem, ResearchSession } from '../types/research';

interface ReportViewProps {
  session: ResearchSession;
  onCitationClick: (sourceId: number) => void;
  onOpenSourcesDrawer: () => void;
  onToggleActionItem: (actionId: string) => void;
  onSelectFollowUpSuggestion: (question: string) => void;
  onRetryResearch: () => void;
  isFollowUpLoading: boolean;
}

function AttachmentsStrip({ attachments }: { attachments?: AttachmentItem[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-2.5">
      {attachments.map((att) =>
        att.kind === 'image' && att.dataUrl ? (
          <img
            key={att.id}
            src={att.dataUrl}
            alt={att.name}
            className="w-20 h-20 object-cover rounded-lg border border-white/20"
          />
        ) : (
          <div
            key={att.id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-xs text-slate-100"
          >
            <FileText className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            <span className="truncate max-w-[160px]">{att.name}</span>
          </div>
        )
      )}
    </div>
  );
}

export function ReportView({
  session,
  onCitationClick,
  onOpenSourcesDrawer,
  onToggleActionItem,
  onSelectFollowUpSuggestion,
  onRetryResearch,
  isFollowUpLoading,
}: ReportViewProps) {
  const [showSteps, setShowSteps] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'actions' | 'matrix'>('summary');
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
  };

  const {
    request,
    steps,
    sources,
    report,
    status,
    errorMessage,
    durationMs,
    followUps,
  } = session;

  const activeStep =
    [...steps].reverse().find((s) => s.status === 'running') ?? steps[steps.length - 1];
  const searchCount = steps.filter((s) => s.type === 'search').length;

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-6 sm:py-8 space-y-6">
      {/* User Prompt Chat Bubble */}
      <div className="flex justify-end">
        <div className="bg-indigo-500/25 border border-indigo-400/30 text-slate-50 rounded-2xl rounded-br-sm px-4 py-3 max-w-[90%] sm:max-w-[78%] text-sm sm:text-base leading-relaxed backdrop-blur-xs">
          <AttachmentsStrip attachments={request.attachments} />
          <div>{request.query}</div>
        </div>
      </div>

      {/* Live Research Progress Card */}
      <div className="space-y-4">
        <div className="bg-[#0B1124]/85 border border-white/12 rounded-xl overflow-hidden backdrop-blur-xs">
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {status === 'running' ? (
                <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
              ) : status === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-medium text-slate-100 truncate">
                  {status === 'running'
                    ? activeStep?.title || 'Running web research...'
                    : status === 'error'
                    ? 'Research interrupted'
                    : `Searched ${searchCount} web ${
                        searchCount === 1 ? 'query' : 'queries'
                      } · ${sources.length} sources${
                        typeof durationMs === 'number'
                          ? ` · ${(durationMs / 1000).toFixed(1)}s`
                          : ''
                      }`}
                </div>
              </div>
            </div>

            {status !== 'running' && (
              <div className="flex items-center gap-2 shrink-0 text-xs text-slate-400">
                <span>{showSteps ? 'Hide steps' : 'Steps'}</span>
                {showSteps ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            )}
          </button>

          {(showSteps || status === 'running') && (
            <div className="border-t border-white/10 divide-y divide-white/8 bg-[#070B1A]/70">
              {steps.length === 0 ? (
                <div className="px-4 py-3 text-xs text-slate-400">
                  Initializing research agent...
                </div>
              ) : (
                steps.map((step) => (
                  <div key={step.id} className="px-4 py-2.5 flex items-start gap-2.5">
                    {step.status === 'running' ? (
                      <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0 mt-0.5" />
                    ) : step.status === 'error' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-100">{step.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        {step.detail}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Loading Skeleton */}
        {status === 'running' && !report && (
          <div className="bg-[#0B1124]/85 border border-white/12 rounded-xl p-5 space-y-3 backdrop-blur-xs">
            <div className="text-xs text-slate-300">
              {activeStep?.detail || 'Gathering live web evidence and verifying sources...'}
            </div>
            <div className="h-4 bg-white/10 rounded w-2/3 animate-pulse" />
            <div className="h-4 bg-white/10 rounded w-full animate-pulse" />
            <div className="h-4 bg-white/10 rounded w-5/6 animate-pulse" />
          </div>
        )}

        {/* Error Card */}
        {status === 'error' && (
          <div className="bg-[#0B1124]/90 border border-rose-500/35 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-50">
                  Could not complete this search
                </div>
                <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                  {errorMessage || 'An unexpected error occurred while researching.'}
                </p>
                <button
                  type="button"
                  onClick={onRetryResearch}
                  className="mt-3 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors cursor-pointer"
                >
                  Retry Research
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Structured Report Card */}
        {report && (
          <div className="bg-[#0B1124]/85 border border-white/12 rounded-xl p-5 sm:p-7 space-y-6 backdrop-blur-xs">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="text-xs font-semibold text-sky-400">
                  Direct Answer & Specific Details
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      'main-report',
                      `${report.title}\n\n${report.executiveSummary}\n\n${report.reportMarkdown}`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  {copiedId === 'main-report' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy answer</span>
                    </>
                  )}
                </button>
              </div>

              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-50">
                {report.title}
              </h1>

              <p className="mt-3 text-sm sm:text-base text-slate-100 leading-relaxed">
                {renderInlineWithCitations(report.executiveSummary, onCitationClick)}
              </p>

              {report.evidenceMatrix.length > 0 && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {report.evidenceMatrix.slice(0, 3).map((row, idx) => (
                    <div
                      key={idx}
                      className="px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/10"
                    >
                      <div className="text-[11px] text-slate-400 truncate">
                        {row.dimension}
                      </div>
                      <div className="mt-0.5 text-sm font-mono font-semibold text-sky-300 tabular-nums truncate">
                        {row.dataPoint}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div
                role="tablist"
                aria-label="Report sections"
                className="inline-flex items-center p-0.5 bg-white/[0.05] rounded-lg border border-white/10 max-w-full overflow-x-auto"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'summary'}
                  onClick={() => setActiveTab('summary')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'summary'
                      ? 'bg-sky-400 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Summary & Findings
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'actions'}
                  onClick={() => setActiveTab('actions')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                    activeTab === 'actions'
                      ? 'bg-sky-400 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Action Plan ({report.recommendations.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'matrix'}
                  onClick={() => setActiveTab('matrix')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                    activeTab === 'matrix'
                      ? 'bg-sky-400 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Evidence Table ({report.evidenceMatrix.length})
                </button>
              </div>
            </div>

            {activeTab === 'summary' && (
              <div className="space-y-6">
                {report.keyFindings.length > 0 && (
                  <div className="divide-y divide-white/10 border-t border-b border-white/10">
                    {report.keyFindings.map((finding, idx) => (
                      <div key={idx} className="py-3.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h2 className="text-sm font-semibold text-slate-50">
                            {idx + 1}. {finding.heading}
                          </h2>
                          {finding.sourceIds.length > 0 && (
                            <span className="flex items-center gap-1">
                              {finding.sourceIds.map((sid) => (
                                <button
                                  key={sid}
                                  type="button"
                                  onClick={() => onCitationClick(sid)}
                                  className="font-mono text-[11px] font-medium text-sky-400 hover:underline cursor-pointer tabular-nums"
                                >
                                  [{sid}]
                                </button>
                              ))}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                          {renderInlineWithCitations(finding.detail, onCitationClick)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <MarkdownWithCitations
                  markdown={report.reportMarkdown}
                  onCitationClick={onCitationClick}
                />

                {report.openQuestions.length > 0 && (
                  <div className="pt-4 border-t border-white/10">
                    <h3 className="font-display text-sm font-semibold text-slate-100 mb-2">
                      Important Details & Edge Cases
                    </h3>
                    <ul className="space-y-1.5 text-sm text-slate-300 list-disc pl-5">
                      {report.openQuestions.map((q, idx) => (
                        <li key={idx}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'actions' && (
              <div className="divide-y divide-white/10 border-t border-b border-white/10">
                {report.recommendations.map((rec) => (
                  <div key={rec.id} className="py-3.5 flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onToggleActionItem(rec.id)}
                      aria-label={`Toggle ${rec.action}`}
                      className="mt-0.5 p-1 -m-1 text-slate-400 hover:text-sky-400 shrink-0 cursor-pointer"
                    >
                      {rec.completed ? (
                        <CheckSquare className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            rec.completed
                              ? 'line-through text-slate-500'
                              : 'text-slate-100'
                          }`}
                        >
                          {rec.action}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            rec.priority === 'High'
                              ? 'text-rose-400'
                              : rec.priority === 'Medium'
                              ? 'text-amber-300'
                              : 'text-slate-400'
                          }`}
                        >
                          {rec.priority} priority
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                        {rec.rationale}
                      </p>
                      <div className="mt-1.5 text-xs text-slate-400">
                        Next step:{' '}
                        <span className="font-medium text-slate-200">
                          {rec.ownerOrNextStep}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'matrix' && (
              <div className="overflow-x-auto border border-white/12 rounded-lg">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-white/[0.04] border-b border-white/12 text-xs font-semibold text-slate-200">
                      <th className="py-2.5 px-3">Dimension</th>
                      <th className="py-2.5 px-3">Summary</th>
                      <th className="py-2.5 px-3">Key Metric</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {report.evidenceMatrix.map((row, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-medium text-slate-100 align-top">
                          {row.dimension}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 align-top leading-relaxed">
                          {row.summary}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-sky-300 align-top tabular-nums">
                          {row.dataPoint}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Reference Web Links */}
            {sources.length > 0 && (
              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-xs font-semibold text-slate-200 tabular-nums">
                    Reference Web Links ({sources.length})
                  </span>
                  <div className="flex items-center gap-3">
                    {sources.length > 6 && (
                      <button
                        type="button"
                        onClick={() => setShowAllLinks((v) => !v)}
                        className="text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
                      >
                        {showAllLinks ? 'Show top 6' : `Show all ${sources.length}`}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenSourcesDrawer}
                      className="text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
                    >
                      Inspect snippets
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(showAllLinks ? sources : sources.slice(0, 6)).map((src) => (
                    <a
                      key={src.id}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-lg transition-colors min-w-0"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-sky-400 shrink-0 tabular-nums">
                          [{src.id}]
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-100 truncate">
                            {src.title}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 truncate">
                            {src.domain}
                          </div>
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up Suggestions */}
            {report.suggestedFollowUps && report.suggestedFollowUps.length > 0 && (
              <div className="pt-4 border-t border-white/10">
                <div className="text-xs font-medium text-slate-400 mb-2">
                  Follow-up questions you can ask
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.suggestedFollowUps.map((fq, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={isFollowUpLoading}
                      onClick={() => onSelectFollowUpSuggestion(fq)}
                      className="text-left px-3 py-2 text-xs font-medium text-slate-200 bg-white/[0.04] hover:bg-white/[0.09] border border-white/12 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {fq}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Follow-up Thread Turns */}
      {followUps.map((turn) =>
        turn.role === 'user' ? (
          <div key={turn.id} className="flex justify-end">
            <div className="bg-indigo-500/25 border border-indigo-400/30 text-slate-50 rounded-2xl rounded-br-sm px-4 py-3 max-w-[90%] sm:max-w-[78%] text-sm sm:text-base leading-relaxed backdrop-blur-xs">
              <AttachmentsStrip attachments={turn.attachments} />
              <div>{turn.content}</div>
            </div>
          </div>
        ) : (
          <div
            key={turn.id}
            className="bg-[#0B1124]/85 border border-white/12 rounded-xl p-5 space-y-4 backdrop-blur-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-sky-400">
                Direct Answer
              </span>
              <button
                type="button"
                onClick={() => handleCopy(turn.id, turn.content)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 rounded-md transition-colors cursor-pointer"
              >
                {copiedId === turn.id ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <MarkdownWithCitations
              markdown={turn.content}
              onCitationClick={onCitationClick}
            />

            {turn.citations && turn.citations.length > 0 && (
              <div className="pt-3 border-t border-white/10">
                <div className="text-[11px] font-semibold text-slate-400 mb-2">
                  Reference Web Links
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {turn.citations.map((cid) => {
                    const src = sources.find((s) => s.id === cid);
                    if (!src) return null;
                    return (
                      <a
                        key={cid}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-lg transition-colors min-w-0"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-sky-400 shrink-0 tabular-nums">
                            [{src.id}]
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-100 truncate">
                              {src.title}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 truncate">
                              {src.domain}
                            </div>
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {isFollowUpLoading && (
        <div className="bg-[#0B1124]/85 border border-white/12 rounded-xl p-4 flex items-center gap-2.5 text-xs text-slate-300">
          <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
          <span>Synthesizing follow-up answer...</span>
        </div>
      )}
    </div>
  );
}
