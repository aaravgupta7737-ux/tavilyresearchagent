import { FileText, LogOut, Plus, Search, ShieldCheck, Trash2, User, X } from 'lucide-react';
import type { AuthUser, ResearchSession } from '../types/research';

interface SidebarProps {
  sessions: ResearchSession[];
  activeSessionId: string | null;
  searchFilter: string;
  onSearchFilterChange: (val: string) => void;
  onSelectSession: (id: string) => void;
  onNewResearch: () => void;
  onDeleteSession: (id: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  user: AuthUser | null;
  onOpenAuthModal: () => void;
  onLogout: () => void;
}

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Sidebar({
  sessions,
  activeSessionId,
  searchFilter,
  onSearchFilterChange,
  onSelectSession,
  onNewResearch,
  onDeleteSession,
  mobileOpen,
  onCloseMobile,
  user,
  onOpenAuthModal,
  onLogout,
}: SidebarProps) {
  const filtered = sessions.filter((s) => {
    if (!searchFilter.trim()) return true;
    const t = searchFilter.toLowerCase();
    return (
      s.request.query.toLowerCase().includes(t) ||
      (s.report?.title ?? '').toLowerCase().includes(t)
    );
  });

  const panel = (
    <div className="flex h-full flex-col bg-[#070B1A] border-r border-white/10 text-slate-200">
      <div className="flex items-center justify-between px-5 h-16 border-b border-white/10 shrink-0">
        <span className="font-display text-base font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
          Tavily Research
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg focus-visible:outline-2 focus-visible:outline-sky-400 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 border-b border-white/10 space-y-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            onNewResearch();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-xl transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => onSearchFilterChange(e.target.value)}
            placeholder="Search your history..."
            aria-label="Filter saved reports"
            className="w-full pl-8 pr-3 py-2 text-xs bg-white/[0.05] border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-400/60 focus:bg-white/[0.08] transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="px-2 pb-2 text-xs font-medium text-slate-400">
          Private History ({filtered.length})
        </div>

        {filtered.length === 0 ? (
          <div className="px-2 py-6 text-xs text-slate-400 leading-relaxed">
            {sessions.length === 0
              ? 'Your private research queries and reports will appear here.'
              : 'No saved reports match your search.'}
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((item) => {
              const isActive = item.id === activeSessionId;
              const title = item.report?.title || item.request.query;
              return (
                <li key={item.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full text-left px-2.5 py-2.5 pr-9 rounded-xl transition-colors duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-sky-400/15 text-white border border-sky-400/30'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-400/80" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium leading-snug line-clamp-2">
                          {title}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                          <span>
                            {item.status === 'running'
                              ? 'Running'
                              : item.status === 'error'
                              ? 'Failed'
                              : `${item.sources.length} sources`}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatShortDate(item.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(item.id);
                    }}
                    aria-label={`Delete ${title}`}
                    className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 absolute right-1.5 top-2 p-1.5 text-slate-400 hover:text-rose-400 rounded transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="p-3 border-t border-white/10 shrink-0 bg-[#050814]/60 space-y-2">
        {user ? (
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-sky-400/20 border border-sky-400/40 text-sky-200 text-xs font-semibold flex items-center justify-center shrink-0">
                {user.name.trim().charAt(0).toUpperCase() || <User className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {user.name}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {user.email || user.phone}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              onOpenAuthModal();
              onCloseMobile();
            }}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-100 bg-white/[0.06] border border-white/15 hover:bg-white/[0.12] rounded-xl transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <span>Sign in (Google / Phone)</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[268px] shrink-0 h-screen sticky top-0 z-20">
        {panel}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">{panel}</aside>
        </div>
      )}
    </>
  );
}
