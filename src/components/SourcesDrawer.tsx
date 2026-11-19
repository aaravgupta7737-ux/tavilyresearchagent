import { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import type { ResearchSource, ResearchStep } from '../types/research';

interface SourcesDrawerProps {
  steps: ResearchStep[];
  sources: ResearchSource[];
  highlightedSourceId: number | null;
  activeTab: 'sources' | 'trace';
  onTabChange: (tab: 'sources' | 'trace') => void;
}

function StepIcon({ step }: { step: ResearchStep }) {
  if (step.status === 'running') {
    return <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0 mt-0.5" />;
  }
  if (step.status === 'error') {
    return <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />;
  }
  return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
}

export function SourcesDrawer({
  steps,
  sources,
  highlightedSourceId,
  activeTab,
  onTabChange,
}: SourcesDrawerProps) {
  const [filterText, setFilterText] = useState('');

  const filteredSources = sources.filter((s) => {
    if (!filterText.trim()) return true;
    const t = filterText.toLowerCase();
    return (
      s.title.toLowerCase().includes(t) ||
      s.domain.toLowerCase().includes(t) ||
      (s.snippet ?? '').toLowerCase().includes(t)
    );
  });

  return (
    <div className="h-full flex flex-col bg-[#0B1124]/90 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
        <div
          role="tablist"
          aria-label="Sources and agent trace"
          className="inline-flex items-center p-0.5 bg-white/[0.05] rounded-lg border border-white/10"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sources'}
            onClick={() => onTabChange('sources')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
              activeTab === 'sources'
                ? 'bg-sky-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Sources ({sources.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'trace'}
            onClick={() => onTabChange('trace')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
              activeTab === 'trace'
                ? 'bg-sky-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Agent Trace ({steps.length})
          </button>
        </div>
      </div>

      {activeTab === 'sources' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {sources.length > 3 && (
            <div className="px-4 py-2.5 border-b border-white/10 shrink-0">
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter retrieved sources..."
                aria-label="Filter retrieved sources"
                className="w-full px-3 py-1.5 text-xs bg-[#050814] border border-white/15 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-white/10">
            {filteredSources.length === 0 ? (
              <div className="p-5 text-xs text-slate-400 leading-relaxed">
                {sources.length === 0
                  ? 'Sources discovered by the agent will appear here in real time.'
                  : 'No sources match your filter.'}
              </div>
            ) : (
              filteredSources.map((src) => {
                const isHighlighted = highlightedSourceId === src.id;
                return (
                  <div
                    key={src.id}
                    id={`source-${src.id}`}
                    className={`p-4 transition-colors duration-150 ${
                      isHighlighted ? 'bg-sky-400/15' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-slate-100 hover:text-sky-300 leading-snug inline-flex items-start gap-1.5 group"
                      >
                        <span className="font-mono text-sky-400 tabular-nums shrink-0">
                          [{src.id}]
                        </span>
                        <span className="group-hover:underline">{src.title}</span>
                      </a>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${src.title}`}
                        className="text-slate-400 hover:text-white shrink-0 p-0.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                      <span className="truncate max-w-[180px]">{src.domain}</span>
                      {src.extracted && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans text-emerald-400 font-medium">
                            Full text extracted
                          </span>
                        </>
                      )}
                      {src.publishedDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{src.publishedDate}</span>
                        </>
                      )}
                    </div>

                    {src.snippet && (
                      <p className="mt-2 text-xs text-slate-300 leading-relaxed line-clamp-3">
                        {src.snippet}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-white/10">
          {steps.length === 0 ? (
            <div className="p-5 text-xs text-slate-400">
              Agent planning, search queries, and page extractions will stream here.
            </div>
          ) : (
            steps.map((step) => (
              <div key={step.id} className="p-4">
                <div className="flex items-start gap-2.5">
                  <StepIcon step={step} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-100 leading-snug">
                      {step.title}
                    </div>
                    <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                      {step.detail}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 tabular-nums">
                      {step.engine && (
                        <span>
                          {step.engine === 'tavily' ? 'Tavily API' : 'Live Web Grounding'}
                        </span>
                      )}
                      {typeof step.resultsCount === 'number' && (
                        <>
                          {step.engine && <span aria-hidden="true">·</span>}
                          <span>{step.resultsCount} results</span>
                        </>
                      )}
                      {typeof step.durationMs === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{(step.durationMs / 1000).toFixed(1)}s</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
