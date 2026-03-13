import type { ModelTier, AIActionProposal } from '@/lib/ai/types';

// ── Chat Message Type ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  actions?: Array<{ label: string; route: string }>;
  pendingAction?: AIActionProposal;
  actionResult?: { success: boolean; message: string };
  interrupted?: boolean;
  isError?: boolean;
  tier?: ModelTier;
  tierLabel?: string;
  cached?: boolean;
  local?: boolean;
  queued?: boolean;
}

// ── Slash Command Type ────────────────────────────────────────────────────────

export interface SlashCommand {
  command: string;
  label: string;
  description: string;
  /** If set, sends this text immediately. If function, takes args after the command. */
  expand: string | ((args: string) => string);
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_SUGGESTIONS = [
  { emoji: '\u{1F4CA}', text: 'What needs my attention today?' },
  { emoji: '\u{26A0}\u{FE0F}', text: 'Show me all critical issues' },
  { emoji: '\u{1F4C8}', text: 'Compare agency health scores' },
  { emoji: '\u{1F3D7}\u{FE0F}', text: 'Delayed project summary' },
  { emoji: '\u{1F4B0}', text: 'Financial overview across agencies' },
  { emoji: '\u{1F4CB}', text: 'My overdue tasks' },
];

export const PAGE_SUGGESTIONS: Record<string, Array<{ emoji: string; text: string }>> = {
  '/': [
    { emoji: '\u{2600}\u{FE0F}', text: 'What needs my attention today?' },
    { emoji: '\u{1F4CB}', text: 'Summarize outstanding tasks across all agencies' },
    { emoji: '\u{23F0}', text: 'What tasks are overdue?' },
    { emoji: '\u{1F4CA}', text: 'Brief me on all agencies' },
  ],
  '/admin/tasks': [
    { emoji: '\u{1F3AF}', text: 'What needs my attention today?' },
    { emoji: '\u{1F4CB}', text: 'Summarize outstanding tasks across all agencies' },
    { emoji: '\u{26A0}\u{FE0F}', text: 'Which tasks are blocked and why?' },
    { emoji: '\u{1F4C5}', text: "What's due this week?" },
  ],
  '/intel/gwi': [
    { emoji: '\u{1F4CA}', text: "Summarize GWI's financial performance" },
    { emoji: '\u{1F4B0}', text: 'Why are only 46% of customers paying on time?' },
    { emoji: '\u{1F4C8}', text: "What's driving the 190% procurement spike?" },
    { emoji: '\u{2705}', text: "Is GWI's complaint resolution improving?" },
  ],
  '/intel/gpl': [
    { emoji: '\u{26A1}', text: 'Show me generation performance this week' },
    { emoji: '\u{1F50B}', text: 'Which feeders have the most outages?' },
    { emoji: '\u{1F4C9}', text: 'Analyze system loss trends' },
    { emoji: '\u{1F3D7}\u{FE0F}', text: 'GPL infrastructure project status' },
  ],
  '/intel/cjia': [
    { emoji: '\u{2708}\u{FE0F}', text: 'How is passenger traffic trending?' },
    { emoji: '\u{1F4CA}', text: 'What is on-time performance this month?' },
    { emoji: '\u{1F4B0}', text: 'CJIA revenue breakdown' },
    { emoji: '\u{26A0}\u{FE0F}', text: 'Any operational issues to flag?' },
  ],
  '/intel/gcaa': [
    { emoji: '\u{1F6E9}\u{FE0F}', text: 'What is the compliance rate?' },
    { emoji: '\u{1F50D}', text: 'Inspection status summary' },
    { emoji: '\u{26A0}\u{FE0F}', text: 'Any safety incidents to review?' },
    { emoji: '\u{1F4CA}', text: 'GCAA performance overview' },
  ],
  '/projects': [
    { emoji: '\u{26A0}\u{FE0F}', text: 'Which delayed projects are most critical?' },
    { emoji: '\u{1F5FA}\u{FE0F}', text: 'Summarize projects by region' },
    { emoji: '\u{1F4B0}', text: "What's the total delayed project value?" },
    { emoji: '\u{1F4CA}', text: 'Compare agency project execution' },
  ],
  '/meetings': [
    { emoji: '\u{1F4DD}', text: 'What decisions came out of last week\'s meetings?' },
    { emoji: '\u{2705}', text: 'Draft follow-up actions from recent meetings' },
    { emoji: '\u{1F4C5}', text: 'What meetings are coming up this week?' },
    { emoji: '\u{1F50D}', text: 'Summarize outstanding action items' },
  ],
  '/budget': [
    { emoji: '\u{1F4B0}', text: 'Where are we against 2026 budget targets?' },
    { emoji: '\u{26A0}\u{FE0F}', text: 'Flag any agencies with underspend risk' },
    { emoji: '\u{1F4CA}', text: 'Compare allocations vs actuals across agencies' },
    { emoji: '\u{1F4C8}', text: 'Which budget lines have the largest variances?' },
  ],
  '/oversight': [
    { emoji: '\u{1F50D}', text: 'What oversight issues need my attention?' },
    { emoji: '\u{26A0}\u{FE0F}', text: 'Any new filings or reports to review?' },
    { emoji: '\u{1F4CA}', text: 'Oversight compliance summary' },
    { emoji: '\u{1F4CB}', text: 'Cross-agency oversight trends' },
  ],
  '/documents': [
    { emoji: '\u{1F4C4}', text: 'What documents were uploaded recently?' },
    { emoji: '\u{1F50D}', text: 'Search documents for capital programme updates' },
    { emoji: '\u{1F4CB}', text: 'Summarize key document findings' },
    { emoji: '\u{1F4CA}', text: 'Documents by agency and category' },
  ],
  '/tasks': [
    { emoji: '\u{23F0}', text: 'What tasks are overdue?' },
    { emoji: '\u{1F4CB}', text: 'Tasks by agency breakdown' },
    { emoji: '\u{26A0}\u{FE0F}', text: 'Which tasks are blocked?' },
    { emoji: '\u{2705}', text: 'What was completed this week?' },
  ],
  '/intel/pending-applications': [
    { emoji: '\u{1F4CA}', text: 'Service connection backlog summary' },
    { emoji: '\u{26A0}\u{FE0F}', text: 'Track A vs Track B SLA compliance' },
    { emoji: '\u{1F4C8}', text: 'Application processing trends' },
    { emoji: '\u{1F50D}', text: 'Which areas have the longest wait times?' },
  ],
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/brief', label: 'Daily Briefing', description: 'Full situational briefing for today', expand: 'Give me a full situational briefing for today. Cover tasks, calendar, agency alerts, and anything that needs my attention.' },
  { command: '/tasks', label: 'Task Overview', description: 'Overdue, blocked, and due this week', expand: 'Show me a task overview: overdue tasks, blocked tasks, and what is due this week. Group by agency.' },
  { command: '/projects', label: 'Delayed Projects', description: 'Summary of delayed PSIP projects', expand: 'Give me a delayed project summary across all agencies. Sort by days overdue, include value and region.' },
  { command: '/meetings', label: 'Meeting Actions', description: 'Pending action items from meetings', expand: 'Summarize recent meetings and list all pending action items that haven\'t been completed yet.' },
  { command: '/status', label: 'Agency Status', description: '/status [agency] — health check', expand: (args: string) => args ? `Give me a health check and status report for ${args}. Cover key metrics, issues, and what needs attention.` : 'Give me a health check across all agencies. Compare scores and flag anything below target.' },
  { command: '/report', label: 'Generate Report', description: '/report [topic] — write and save', expand: (args: string) => args ? `Generate a report on ${args}. Use real data, be specific with numbers, and save it to the Document Vault.` : 'What report would you like me to generate? Give me a topic and I\'ll write it with real data and save it.' },
  { command: '/flag', label: 'Flag Issue', description: '/flag [issue] — flag for attention', expand: (args: string) => args ? `Flag this issue for my attention: ${args}` : 'What issue would you like to flag? Describe the problem.' },
  { command: '/connections', label: 'Service Connections', description: 'GPL application backlog & SLA', expand: 'Show me the GPL service connection backlog. Break down by Track A and Track B, include SLA compliance and oldest pending applications.' },
  { command: '/budget', label: 'Budget Status', description: 'Budget vs actuals overview', expand: 'Give me a budget overview: allocations vs actuals across all agencies. Flag any underspend or overspend risks.' },
  { command: '/docs', label: 'Search Documents', description: '/docs [search] — find in vault', expand: (args: string) => args ? `Search the Document Vault for: ${args}` : 'What would you like to search for in the Document Vault?' },
];

export const PLACEHOLDERS = [
  'Ask about any agency, project, metric...',
  'Why did GWI collections drop 9%?',
  'Which GPL stations are underperforming?',
  'How many projects are delayed in Region 4?',
  'Compare GWI and GPL health scores',
  'What should I focus on this week?',
  'Summarize procurement spending trends',
];

export const PAGE_NAMES: Record<string, string> = {
  '/': 'Mission Control',
  '/intel': 'Agency Intel',
  '/intel/gpl': 'GPL Dashboard',
  '/intel/gwi': 'GWI Dashboard',
  '/intel/cjia': 'CJIA Dashboard',
  '/intel/gcaa': 'GCAA Dashboard',
  '/intel/pending-applications': 'Service Connections',
  '/projects': 'Project Tracker',
  '/documents': 'Document Vault',
  '/calendar': 'Calendar',
  '/meetings': 'Meetings',
  '/budget': 'Budget 2026',
  '/oversight': 'Oversight',
  '/admin': 'Admin',
  '/admin/tasks': 'War Room',
  '/admin/people': 'People',
  '/tasks': 'Task Board',
};

export const AGENCY_ROUTES: Record<string, string> = {
  GPL: '/intel/gpl',
  GWI: '/intel/gwi',
  CJIA: '/intel/cjia',
  GCAA: '/intel/gcaa',
};

export const TIER_COLORS: Record<string, string> = {
  haiku: '#22c55e',   // green
  sonnet: '#3b82f6',  // blue
  opus: '#d4af37',    // gold
};

// ── Utility Functions ─────────────────────────────────────────────────────────

export function parseSuggestions(text: string): { clean: string; suggestions: string[] } {
  const match = text.match(/<!--\s*suggestions:\s*(\[[\s\S]*?\])\s*-->/);
  if (!match) return { clean: text, suggestions: [] };
  try {
    const suggestions = JSON.parse(match[1]) as string[];
    return { clean: text.replace(match[0], '').trim(), suggestions };
  } catch { return { clean: text, suggestions: [] }; }
}

export function parseActions(text: string): { clean: string; actions: Array<{ label: string; route: string }> } {
  const actions: Array<{ label: string; route: string }> = [];
  let clean = text;
  const regex = /<!--\s*action:\s*(\{[^}]*?\})\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      actions.push(JSON.parse(match[1]));
      clean = clean.replace(match[0], '');
    } catch { /* skip */ }
  }
  return { clean: clean.trim(), actions };
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function getTierDisplayName(msg: ChatMessage): string {
  if (msg.local) return 'Instant';
  if (msg.cached) return 'Cached';
  if (msg.tierLabel) return `Claude ${msg.tierLabel}`;
  return 'Claude';
}
