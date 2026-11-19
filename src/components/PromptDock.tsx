import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUp,
  Camera,
  FileText,
  Globe,
  Image as ImageIcon,
  Plus,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react';
import type {
  AttachmentItem,
  ReportFormat,
  ResearchDepth,
  ResearchRequest,
  TimeRange,
} from '../types/research';

interface PromptDockProps {
  hasActiveReport: boolean;
  isRunning: boolean;
  isFollowUpLoading: boolean;
  onStartResearch: (req: ResearchRequest) => void;
  onSendFollowUp: (
    question: string,
    runLiveSearch: boolean,
    attachments: AttachmentItem[]
  ) => Promise<void>;
  onStopResearch: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDomains(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, ''))
    .filter(Boolean);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function PromptDock({
  hasActiveReport,
  isRunning,
  isFollowUpLoading,
  onStartResearch,
  onSendFollowUp,
  onStopResearch,
}: PromptDockProps) {
  const [text, setText] = useState('');
  const [depth, setDepth] = useState<ResearchDepth>('standard');
  const [timeRange, setTimeRange] = useState<TimeRange>('any');
  const [format, setFormat] = useState<ReportFormat>('executive_brief');
  const [includeDomains, setIncludeDomains] = useState('');
  const [excludeDomains, setExcludeDomains] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [runLiveSearch, setRunLiveSearch] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setShowUploadMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleFiles = async (files: FileList | null, mode: 'image' | 'document') => {
    setShowUploadMenu(false);
    setUploadError(null);
    if (!files || files.length === 0) return;

    const nextItems: AttachmentItem[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(`"${file.name}" exceeds the 10 MB upload limit.`);
        continue;
      }
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        if (mode === 'image' || file.type.startsWith('image/')) {
          const dataUrl = await readAsDataUrl(file);
          nextItems.push({
            id,
            name: file.name,
            mimeType: file.type || 'image/png',
            kind: 'image',
            size: file.size,
            dataUrl,
          });
        } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const dataUrl = await readAsDataUrl(file);
          nextItems.push({
            id,
            name: file.name,
            mimeType: 'application/pdf',
            kind: 'document',
            size: file.size,
            dataUrl,
          });
        } else {
          const textContent = await readAsText(file);
          nextItems.push({
            id,
            name: file.name,
            mimeType: file.type || 'text/plain',
            kind: 'document',
            size: file.size,
            textContent: textContent.slice(0, 40000),
          });
        }
      } catch {
        setUploadError(`Could not read "${file.name}".`);
      }
    }

    if (nextItems.length > 0) {
      setAttachments((prev) => [...prev, ...nextItems].slice(0, 6));
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const disabled = isRunning || isFollowUpLoading;
  const canSend = !disabled && (text.trim().length > 0 || attachments.length > 0);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;

    const prompt = text.trim();
    const attached = [...attachments];
    setText('');
    setAttachments([]);
    setShowFilters(false);
    setShowUploadMenu(false);
    setUploadError(null);

    if (hasActiveReport) {
      await onSendFollowUp(prompt, runLiveSearch, attached);
    } else {
      onStartResearch({
        query: prompt,
        depth,
        timeRange,
        format,
        includeDomains: parseDomains(includeDomains),
        excludeDomains: parseDomains(excludeDomains),
        attachments: attached,
      });
    }
  };

  return (
    <div className="shrink-0 bg-gradient-to-t from-[#050814] via-[#050814]/95 to-transparent px-3 sm:px-6 pt-2 pb-3 sm:pb-5 relative z-20">
      <div className="max-w-3xl mx-auto">
        {uploadError && (
          <div className="mb-2 px-3 py-2 text-xs text-rose-200 bg-rose-950/70 border border-rose-500/30 rounded-xl flex items-center justify-between">
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="p-1 text-rose-300 hover:text-white cursor-pointer"
              aria-label="Dismiss upload error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {showFilters && !hasActiveReport && (
          <div className="mb-2.5 bg-[#0B1124]/95 backdrop-blur-md border border-white/15 rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-100">
                Research Scope & Filters
              </span>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                aria-label="Close options"
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Search Depth
                </label>
                <select
                  aria-label="Search Depth"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value as ResearchDepth)}
                  className="w-full px-2.5 py-2 text-xs text-slate-100 bg-[#050814] border border-white/15 rounded-lg focus:outline-none focus:border-sky-400"
                >
                  <option value="quick">Quick</option>
                  <option value="standard">Standard</option>
                  <option value="deep">Deep</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="dock-timeframe"
                  className="block text-[11px] font-medium text-slate-400 mb-1"
                >
                  Timeframe
                </label>
                <select
                  id="dock-timeframe"
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                  className="w-full px-2.5 py-2 text-xs text-slate-100 bg-[#050814] border border-white/15 rounded-lg focus:outline-none focus:border-sky-400"
                >
                  <option value="any">Any time</option>
                  <option value="day">Past 24 hours</option>
                  <option value="week">Past week</option>
                  <option value="month">Past month</option>
                  <option value="year">Past year</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="dock-format"
                  className="block text-[11px] font-medium text-slate-400 mb-1"
                >
                  Report Format
                </label>
                <select
                  id="dock-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ReportFormat)}
                  className="w-full px-2.5 py-2 text-xs text-slate-100 bg-[#050814] border border-white/15 rounded-lg focus:outline-none focus:border-sky-400"
                >
                  <option value="executive_brief">Executive Brief</option>
                  <option value="comparison_matrix">Comparison Matrix</option>
                  <option value="technical_deep_dive">Technical Deep-Dive</option>
                  <option value="action_plan">Action Plan</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="dock-include-domains"
                  className="block text-[11px] font-medium text-slate-400 mb-1"
                >
                  Include domains (optional)
                </label>
                <input
                  id="dock-include-domains"
                  type="text"
                  value={includeDomains}
                  onChange={(e) => setIncludeDomains(e.target.value)}
                  placeholder="arxiv.org, github.com"
                  className="w-full px-2.5 py-1.5 text-xs font-mono text-slate-100 bg-[#050814] border border-white/15 rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div>
                <label
                  htmlFor="dock-exclude-domains"
                  className="block text-[11px] font-medium text-slate-400 mb-1"
                >
                  Exclude domains (optional)
                </label>
                <input
                  id="dock-exclude-domains"
                  type="text"
                  value={excludeDomains}
                  onChange={(e) => setExcludeDomains(e.target.value)}
                  placeholder="reddit.com, pinterest.com"
                  className="w-full px-2.5 py-1.5 text-xs font-mono text-slate-100 bg-[#050814] border border-white/15 rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>
          </div>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files, 'image');
            e.target.value = '';
          }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files, 'image');
            e.target.value = '';
          }}
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.txt,.md,.csv,.json,.xml,.html,.log"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files, 'document');
            e.target.value = '';
          }}
        />

        <form
          onSubmit={handleSubmit}
          className="bg-[#0B1124]/90 backdrop-blur-md border border-white/15 focus-within:border-sky-400/60 rounded-2xl p-2.5 sm:p-3 transition-colors shadow-xl"
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2.5 mb-2 border-b border-white/10">
              {attachments.map((att) =>
                att.kind === 'image' && att.dataUrl ? (
                  <div
                    key={att.id}
                    className="relative group w-16 h-16 rounded-xl overflow-hidden border border-white/15 bg-black/40 shrink-0"
                  >
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      aria-label={`Remove ${att.name}`}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-950/85 text-white flex items-center justify-center hover:bg-slate-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.06] border border-white/12 rounded-xl text-xs max-w-[200px]"
                  >
                    <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-100 truncate">{att.name}</div>
                      <div className="text-[10px] text-slate-400 tabular-nums">
                        {formatBytes(att.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      aria-label={`Remove ${att.name}`}
                      className="p-0.5 text-slate-400 hover:text-white shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={isRunning}
            placeholder={hasActiveReport ? 'Ask a follow-up...' : 'Ask anything...'}
            aria-label="Research prompt"
            className="w-full resize-none bg-transparent px-1.5 py-1 text-sm sm:text-base text-slate-100 placeholder:text-slate-400 focus:outline-none leading-relaxed max-h-[140px]"
          />

          <div className="mt-2 pt-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 relative" ref={menuContainerRef}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setShowUploadMenu((v) => !v)}
                aria-label="Upload image, photo library, or documents"
                aria-expanded={showUploadMenu}
                className="w-10 h-10 flex items-center justify-center rounded-full border border-white/12 bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-5 h-5" />
              </button>

              {showUploadMenu && (
                <div
                  role="menu"
                  className="absolute bottom-12 left-0 w-56 bg-[#0B1124] border border-white/15 rounded-2xl shadow-2xl py-1.5 z-30"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left text-xs font-medium text-slate-100 hover:bg-white/[0.08] cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Upload Image / Camera</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => galleryInputRef.current?.click()}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left text-xs font-medium text-slate-100 hover:bg-white/[0.08] cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Photo Library</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => docInputRef.current?.click()}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left text-xs font-medium text-slate-100 hover:bg-white/[0.08] cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Upload Documents (PDF, TXT, CSV)</span>
                  </button>
                </div>
              )}

              {hasActiveReport ? (
                <button
                  type="button"
                  onClick={() => setRunLiveSearch((v) => !v)}
                  className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    runLiveSearch
                      ? 'bg-sky-400/15 border-sky-400/40 text-sky-200'
                      : 'bg-white/[0.04] border-white/12 text-slate-300 hover:text-white'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{runLiveSearch ? 'Google search on' : 'Report only'}</span>
                </button>
              ) : (
                <>
                  <div
                    role="group"
                    aria-label="Research precision depth"
                    className="inline-flex items-center p-0.5 bg-white/[0.04] border border-white/12 rounded-full"
                  >
                    {(['quick', 'standard', 'deep'] as ResearchDepth[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDepth(d)}
                        className={`px-2.5 py-1.5 text-[11px] sm:text-xs font-medium rounded-full transition-colors capitalize whitespace-nowrap cursor-pointer ${
                          depth === d
                            ? 'bg-sky-400 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowFilters((v) => !v)}
                    aria-label="Research scope options"
                    className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      showFilters ||
                      timeRange !== 'any' ||
                      format !== 'executive_brief' ||
                      includeDomains ||
                      excludeDomains
                        ? 'bg-sky-400/15 border-sky-400/40 text-sky-200'
                        : 'bg-white/[0.04] border-white/12 text-slate-300 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Filters</span>
                  </button>
                </>
              )}
            </div>

            {isRunning ? (
              <button
                type="button"
                onClick={onStopResearch}
                aria-label="Stop research"
                className="w-10 h-10 flex items-center justify-center rounded-full bg-rose-500 hover:bg-rose-400 text-white transition-colors cursor-pointer shrink-0"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                className="w-10 h-10 flex items-center justify-center rounded-full bg-sky-400 hover:bg-sky-300 disabled:bg-white/10 disabled:text-slate-500 text-slate-950 transition-colors cursor-pointer shrink-0"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
