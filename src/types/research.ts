export type ResearchDepth = 'quick' | 'standard' | 'deep';
export type TimeRange = 'any' | 'day' | 'week' | 'month' | 'year';
export type ReportFormat =
  | 'executive_brief'
  | 'comparison_matrix'
  | 'technical_deep_dive'
  | 'action_plan';

export interface AttachmentItem {
  id: string;
  name: string;
  mimeType: string;
  kind: 'image' | 'document';
  size: number;
  dataUrl?: string;
  textContent?: string;
}

export interface ResearchRequest {
  query: string;
  depth: ResearchDepth;
  timeRange: TimeRange;
  format: ReportFormat;
  includeDomains: string[];
  excludeDomains: string[];
  attachments: AttachmentItem[];
}

export interface ResearchStep {
  id: string;
  type: 'plan' | 'search' | 'extract' | 'synthesize';
  title: string;
  detail: string;
  status: 'running' | 'completed' | 'error';
  engine?: 'gemini' | 'tavily';
  resultsCount?: number;
  durationMs?: number;
}

export interface ResearchSource {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  extracted?: boolean;
  publishedDate?: string;
}

export interface KeyFinding {
  heading: string;
  detail: string;
  sourceIds: number[];
}

export interface Recommendation {
  id: string;
  action: string;
  rationale: string;
  priority: 'High' | 'Medium' | 'Low';
  ownerOrNextStep: string;
  completed: boolean;
  sourceIds?: number[];
}

export interface EvidenceRow {
  dimension: string;
  summary: string;
  dataPoint: string;
}

export interface StructuredReport {
  title: string;
  executiveSummary: string;
  keyFindings: KeyFinding[];
  recommendations: Recommendation[];
  evidenceMatrix: EvidenceRow[];
  reportMarkdown: string;
  openQuestions: string[];
  suggestedFollowUps: string[];
}

export interface FollowUpTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: AttachmentItem[];
  citations?: number[];
  timestamp: number;
}

export interface ResearchSession {
  id: string;
  request: ResearchRequest;
  status: 'running' | 'completed' | 'error';
  steps: ResearchStep[];
  sources: ResearchSource[];
  report?: StructuredReport;
  followUps: FollowUpTurn[];
  errorMessage?: string;
  engineUsed?: string;
  durationMs?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  provider: 'google' | 'phone';
}
