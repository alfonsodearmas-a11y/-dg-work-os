'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X, Minus, Trash2, ArrowUp, Loader2, Sparkles, ExternalLink, RotateCcw, AlertTriangle, Zap, WifiOff, Check, Ban, Play } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { tryLocalAnswer } from '@/lib/ai/local-answers';
import { saveToOffline, getFromOffline } from '@/lib/offline/offline-store';
import type { MetricSnapshot, ModelTier, ChatStreamEvent, AIActionProposal } from '@/lib/ai/types';

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
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

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SUGGESTIONS = [
  { emoji: '\u{1F4CA}', text: 'What needs my attention today?' },
  { emoji: '\u{26A0}\u{FE0F}', text: 'Show me all critical issues' },
  { emoji: '\u{1F4C8}', text: 'Compare agency health scores' },
  { emoji: '\u{1F3D7}\u{FE0F}', text: 'Delayed project summary' },
  { emoji: '\u{1F4B0}', text: 'Financial overview across agencies' },
  { emoji: '\u{1F4CB}', text: 'My overdue tasks' },
];

const PAGE_SUGGESTIONS: Record<string, Array<{ emoji: string; text: string }>> = {
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

// ── Slash Commands ──────────────────────────────────────────────────────────

interface SlashCommand {
  command: string;
  label: string;
  description: string;
  /** If set, sends this text immediately. If function, takes args after the command. */
  expand: string | ((args: string) => string);
}

const SLASH_COMMANDS: SlashCommand[] = [
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

const PLACEHOLDERS = [
  'Ask about any agency, project, metric...',
  'Why did GWI collections drop 9%?',
  'Which GPL stations are underperforming?',
  'How many projects are delayed in Region 4?',
  'Compare GWI and GPL health scores',
  'What should I focus on this week?',
  'Summarize procurement spending trends',
];

const PAGE_NAMES: Record<string, string> = {
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
  '/admin/tasks': 'Command Centre',
  '/admin/people': 'People',
  '/tasks': 'Task Board',
};

const AGENCY_ROUTES: Record<string, string> = {
  GPL: '/intel/gpl',
  GWI: '/intel/gwi',
  CJIA: '/intel/cjia',
  GCAA: '/intel/gcaa',
};

const TIER_COLORS: Record<string, string> = {
  haiku: '#22c55e',   // green
  sonnet: '#3b82f6',  // blue
  opus: '#d4af37',    // gold
};

// ── Markdown Renderer ────────────────────────────────────────────────────────

function renderInline(text: string, onAgencyClick?: (route: string) => void): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\b(GPL|GWI|CJIA|GCAA)\b)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      nodes.push(
        <strong key={key++} className="font-semibold" style={{ background: 'rgba(212,175,55,0.1)', borderRadius: 4, padding: '0 4px' }}>
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      nodes.push(<em key={key++} className="italic text-white/80">{match[4]}</em>);
    } else if (match[5]) {
      nodes.push(
        <code key={key++} className="px-1.5 py-0.5 rounded bg-white/10 text-[#d4af37] text-[13px] font-mono">
          {match[6]}
        </code>
      );
    } else if (match[7] && onAgencyClick) {
      const agency = match[8];
      const route = AGENCY_ROUTES[agency];
      if (route) {
        nodes.push(
          <button
            key={key++}
            onClick={(e) => { e.stopPropagation(); onAgencyClick(route); }}
            className="text-[#d4af37] hover:underline decoration-[#d4af37]/40 underline-offset-2 font-medium cursor-pointer"
          >
            {agency}
          </button>
        );
      } else {
        nodes.push(agency);
      }
    } else if (match[7]) {
      nodes.push(match[7]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function MarkdownTable({ rows, onAgencyClick }: { rows: string[][]; onAgencyClick?: (route: string) => void }) {
  if (rows.length < 2) return null;
  const headers = rows[0];
  const bodyRows = rows.slice(1);

  return (
    <div className="overflow-x-auto my-3 rounded-lg border border-white/10">
      <table className="w-full text-xs" aria-label="Data table">
        <thead>
          <tr className="bg-white/5 border-b border-white/10">
            {headers.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2 text-left text-[#d4af37] font-semibold whitespace-nowrap">
                {renderInline(h.trim(), onAgencyClick)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-white/80 whitespace-nowrap">
                  {renderInline(cell.trim(), onAgencyClick)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownContent({ text, onAgencyClick }: { text: string; onAgencyClick?: (route: string) => void }) {
  const blocks = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let tableRows: string[][] = [];
  let inTable = false;
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag key={key++} className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 space-y-1 my-2`}>
          {listItems}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(<MarkdownTable key={key++} rows={tableRows} onAgencyClick={onAgencyClick} />);
      tableRows = [];
      inTable = false;
    }
  };

  for (const line of blocks) {
    const trimmed = line.trim();

    // Table detection: lines with | separators
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList();
      // Skip separator rows (|---|---|)
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
        inTable = true;
        continue;
      }
      const cells = trimmed.slice(1, -1).split('|');
      tableRows.push(cells);
      inTable = true;
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (!trimmed) { flushList(); continue; }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(<li key={key++} className="text-white/90">{renderInline(ulMatch[1], onAgencyClick)}</li>);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(<li key={key++} className="text-white/90">{renderInline(olMatch[1], onAgencyClick)}</li>);
      continue;
    }

    flushList();

    if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={key++} className="text-sm font-semibold text-[#d4af37] mt-3 mb-1">{renderInline(trimmed.slice(4), onAgencyClick)}</h4>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={key++} className="text-base font-semibold text-[#d4af37] mt-3 mb-1">{renderInline(trimmed.slice(3), onAgencyClick)}</h3>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<h2 key={key++} className="text-lg font-bold text-[#d4af37] mt-3 mb-1">{renderInline(trimmed.slice(2), onAgencyClick)}</h2>);
    } else {
      elements.push(<p key={key++} className="my-1 leading-relaxed">{renderInline(trimmed, onAgencyClick)}</p>);
    }
  }

  flushList();
  flushTable();
  return <div className="space-y-0.5">{elements}</div>;
}

// ── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="px-4 py-3 rounded-2xl rounded-bl bg-white/5 flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-[#d4af37]"
            style={{ animation: 'chatBounce 1.4s ease-in-out infinite', animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Tier Pill ────────────────────────────────────────────────────────────────

function TierPill({ tier, tierLabel, cached, local }: {
  tier?: ModelTier; tierLabel?: string; cached?: boolean; local?: boolean;
}) {
  const label = local ? 'Instant' : cached ? 'Cached' : (tierLabel || 'Deep');
  const color = local ? '#22c55e' : cached ? '#94a3b8' : TIER_COLORS[tier || 'opus'];

  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ml-1.5"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}

// ── Budget Bar ───────────────────────────────────────────────────────────────

function BudgetBar({ pct }: { pct: number }) {
  if (pct < 50) return null;

  const color = pct >= 95 ? '#dc2626' : pct >= 80 ? '#d4af37' : '#3b82f6';

  return (
    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, pct)}%`, background: color }}
      />
    </div>
  );
}

// ── Suggestion / Action Parsing ──────────────────────────────────────────────

function parseSuggestions(text: string): { clean: string; suggestions: string[] } {
  const match = text.match(/<!--\s*suggestions:\s*(\[[\s\S]*?\])\s*-->/);
  if (!match) return { clean: text, suggestions: [] };
  try {
    const suggestions = JSON.parse(match[1]) as string[];
    return { clean: text.replace(match[0], '').trim(), suggestions };
  } catch { return { clean: text, suggestions: [] }; }
}

function parseActions(text: string): { clean: string; actions: Array<{ label: string; route: string }> } {
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

// ── Action Confirmation Card ─────────────────────────────────────────────────

function ActionCard({
  action,
  onExecute,
  onCancel,
  result,
  executing,
}: {
  action: AIActionProposal;
  onExecute: () => void;
  onCancel: () => void;
  result?: { success: boolean; message: string };
  executing?: boolean;
}) {
  return (
    <div
      className="my-3 rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(212, 175, 55, 0.4)', background: 'rgba(212, 175, 55, 0.05)' }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#d4af37]/20">
        <Play className="h-4 w-4 text-[#d4af37]" />
        <span className="text-sm font-semibold text-[#d4af37]">{action.display.title}</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <p className="text-sm text-white/80">{action.display.description}</p>
        {action.display.details.length > 0 && (
          <div className="space-y-1">
            {action.display.details.map((d, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-white/40 min-w-[80px]">{d.label}:</span>
                <span className="text-white/70">{d.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {result ? (
        <div className={`flex items-center gap-2 px-4 py-2.5 border-t ${result.success ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-red-500/20 bg-red-500/10'}`}>
          {result.success ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Ban className="h-4 w-4 text-red-400" />
          )}
          <span className={`text-xs ${result.success ? 'text-emerald-300' : 'text-red-300'}`}>{result.message}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[#d4af37]/20">
          <button
            onClick={onExecute}
            disabled={executing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/40 hover:bg-[#d4af37]/30 disabled:opacity-50"
          >
            {executing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {executing ? 'Executing...' : 'Execute'}
          </button>
          <button
            onClick={onCancel}
            disabled={executing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 disabled:opacity-50"
          >
            <Ban className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ChatPanel({ isOpen, onClose, onMinimize }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [streamingText, setStreamingText] = useState('');
  const [streamingMeta, setStreamingMeta] = useState<{ tier?: ModelTier; tierLabel?: string; cached?: boolean; local?: boolean } | null>(null);
  const [contextWarning, setContextWarning] = useState(false);
  const [forceDeep, setForceDeep] = useState(false);
  const [budgetPct, setBudgetPct] = useState(0);
  const [snapshot, setSnapshot] = useState<MetricSnapshot | null>(null);
  const [executingAction, setExecutingAction] = useState(false);
  const [slashFilter, setSlashFilter] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSentRef = useRef<string>('');
  const touchStartY = useRef(0);
  const snapshotFetched = useRef(false);

  // ── Derived ──

  const pageName = useMemo(() => {
    if (PAGE_NAMES[pathname]) return PAGE_NAMES[pathname];
    if (pathname.startsWith('/projects/')) return 'Project Detail';
    if (pathname.startsWith('/documents/')) return 'Document';
    if (pathname.startsWith('/intel/')) return 'Agency Intel';
    return 'DG Work OS';
  }, [pathname]);

  const suggestions = useMemo(() => {
    if (PAGE_SUGGESTIONS[pathname]) return PAGE_SUGGESTIONS[pathname];
    if (pathname.startsWith('/projects')) return PAGE_SUGGESTIONS['/projects'];
    if (pathname.startsWith('/intel/pending-applications')) return PAGE_SUGGESTIONS['/intel/pending-applications'];
    if (pathname.startsWith('/intel/gwi')) return PAGE_SUGGESTIONS['/intel/gwi'];
    if (pathname.startsWith('/intel/gpl')) return PAGE_SUGGESTIONS['/intel/gpl'];
    if (pathname.startsWith('/intel/cjia')) return PAGE_SUGGESTIONS['/intel/cjia'];
    if (pathname.startsWith('/intel/gcaa')) return PAGE_SUGGESTIONS['/intel/gcaa'];
    if (pathname.startsWith('/intel')) return DEFAULT_SUGGESTIONS;
    if (pathname.startsWith('/meetings')) return PAGE_SUGGESTIONS['/meetings'];
    if (pathname.startsWith('/budget')) return PAGE_SUGGESTIONS['/budget'];
    if (pathname.startsWith('/oversight')) return PAGE_SUGGESTIONS['/oversight'];
    if (pathname.startsWith('/documents')) return PAGE_SUGGESTIONS['/documents'];
    if (pathname.startsWith('/admin/tasks')) return PAGE_SUGGESTIONS['/admin/tasks'];
    return DEFAULT_SUGGESTIONS;
  }, [pathname]);

  const filteredSlashCommands = useMemo(() => {
    if (slashFilter === null) return [];
    const q = slashFilter.toLowerCase();
    return SLASH_COMMANDS.filter(c =>
      c.command.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
    );
  }, [slashFilter]);

  // ── Fetch snapshot on open ──

  useEffect(() => {
    if (isOpen && !snapshotFetched.current) {
      snapshotFetched.current = true;
      fetch('/api/ai/snapshot')
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setSnapshot(data as MetricSnapshot); })
        .catch(() => {});
    }
  }, [isOpen]);

  // ── Placeholder rotation ──

  useEffect(() => {
    const timer = setInterval(() => setPlaceholderIdx(prev => (prev + 1) % PLACEHOLDERS.length), 5000);
    return () => clearInterval(timer);
  }, []);

  // ── Auto-scroll ──

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // ── Focus textarea on open ──

  useEffect(() => {
    if (isOpen && !isMobile) {
      setTimeout(() => textareaRef.current?.focus(), 350);
    }
  }, [isOpen, isMobile]);

  // ── Body scroll lock (mobile) ──

  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isMobile, isOpen]);

  // ── Focus trap ──

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;

    const panel = panelRef.current;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    panel.addEventListener('keydown', handleTab);
    return () => panel.removeEventListener('keydown', handleTab);
  }, [isOpen, messages, isStreaming]);

  // ── Send Message ──

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');
    setStreamingMeta(null);
    setContextWarning(false);
    lastSentRef.current = text.trim();

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // ── Try local answer first (zero cost, instant) ──
    if (snapshot && !forceDeep) {
      const local = tryLocalAnswer(text.trim(), snapshot);
      if (local) {
        const { clean: c1, suggestions: sug } = parseSuggestions(local.text + `\n<!-- suggestions: ${JSON.stringify(local.suggestions)} -->`);
        setMessages(prev => [...prev, {
          role: 'assistant', content: c1, timestamp: new Date(),
          suggestions: sug, tier: 'haiku', tierLabel: 'Instant', local: true,
        }]);
        setIsStreaming(false);
        return;
      }
    }

    // ── Offline: queue the question ──
    if (!navigator.onLine) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'll answer this as soon as you're back online. Your question has been saved.",
        timestamp: new Date(),
        queued: true,
      }]);
      setIsStreaming(false);
      // Save to IndexedDB for later
      saveToOffline('ai-conversations', 'pending-' + Date.now(), { question: text.trim(), page: pathname }).catch(() => {});
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const history = [...messages, userMessage]
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          conversation_history: history.slice(0, -1),
          current_page: pathname,
          session_id: 'dg-session',
          force_deep: forceDeep,
          snapshot: snapshot,
        }),
        signal: abort.signal,
      });

      // Reset force deep after sending
      if (forceDeep) setForceDeep(false);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }));
        const errMsg = errData.error || `HTTP ${res.status}`;

        let displayMsg: string;
        if (res.status === 429) {
          displayMsg = "You've reached the message limit. Please wait a few minutes.";
        } else if (errMsg.includes('API') || errMsg.includes('key') || errMsg.includes('ANTHROPIC')) {
          displayMsg = 'AI service unavailable \u2014 check Anthropic API key in settings.';
        } else {
          displayMsg = `I couldn't process that request. ${errMsg}`;
        }

        setMessages(prev => [...prev, { role: 'assistant', content: displayMsg, timestamp: new Date(), isError: true }]);
        setIsStreaming(false);
        return;
      }

      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';
      let streamComplete = false;
      let responseTier: ModelTier | undefined;
      let responseTierLabel: string | undefined;
      let responseCached = false;
      let responseLocal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as ChatStreamEvent;

            if (event.type === 'meta') {
              responseTier = event.tier;
              responseTierLabel = event.tier_label;
              responseCached = event.cached;
              responseLocal = event.local;
              setStreamingMeta({ tier: event.tier, tierLabel: event.tier_label, cached: event.cached, local: event.local });
            } else if (event.type === 'text') {
              accumulated += event.text;
              setStreamingText(accumulated);

              if (!contextWarning && (accumulated.includes('data sources unavailable') || (accumulated.includes('unavailable') && accumulated.includes('data')))) {
                setContextWarning(true);
              }
            } else if (event.type === 'tool_use') {
              // AI proposed an action — add text so far as a message, then action card
              if (accumulated.trim()) {
                const { clean: c1, suggestions: sug } = parseSuggestions(accumulated);
                const { clean: c2, actions: navActions } = parseActions(c1);
                setMessages(prev => [...prev, {
                  role: 'assistant', content: c2, timestamp: new Date(),
                  suggestions: sug, actions: navActions,
                  tier: responseTier, tierLabel: responseTierLabel,
                  cached: responseCached, local: responseLocal,
                }]);
                accumulated = '';
                setStreamingText('');
              }
              // Add action proposal as a separate message
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                pendingAction: event.action,
                tier: responseTier,
                tierLabel: responseTierLabel,
              }]);
            } else if (event.type === 'done') {
              const { clean: c1, suggestions: sug } = parseSuggestions(accumulated);
              const { clean: c2, actions } = parseActions(c1);
              // Only add a text message if there's content (might have been drained by tool_use)
              if (c2.trim()) {
                setMessages(prev => [...prev, {
                  role: 'assistant', content: c2, timestamp: new Date(),
                  suggestions: sug, actions,
                  tier: event.tier, tierLabel: event.tier_label,
                  cached: event.cached, local: event.local,
                }]);
              } else if (sug.length > 0) {
                // Attach suggestions to the last assistant message
                setMessages(prev => {
                  const updated = [...prev];
                  for (let idx = updated.length - 1; idx >= 0; idx--) {
                    if (updated[idx].role === 'assistant') {
                      updated[idx] = { ...updated[idx], suggestions: sug };
                      break;
                    }
                  }
                  return updated;
                });
              }
              setStreamingText('');
              setStreamingMeta(null);
              setIsStreaming(false);
              streamComplete = true;
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }

      // Stream ended without 'done' — interrupted
      if (!streamComplete && accumulated) {
        const { clean: c1, suggestions: sug } = parseSuggestions(accumulated);
        const { clean: c2, actions } = parseActions(c1);
        setMessages(prev => [...prev, {
          role: 'assistant', content: c2, timestamp: new Date(),
          suggestions: sug, actions, interrupted: true,
          tier: responseTier, tierLabel: responseTierLabel,
          cached: responseCached, local: responseLocal,
        }]);
        setStreamingText('');
        setStreamingMeta(null);
        setIsStreaming(false);
      } else if (!streamComplete && !accumulated) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Response interrupted before any content was received.',
          timestamp: new Date(), isError: true, interrupted: true,
        }]);
        setStreamingText('');
        setStreamingMeta(null);
        setIsStreaming(false);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[Chat] Error:', err);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I couldn't process that request. ${err.message}`,
        timestamp: new Date(), isError: true,
      }]);
      setStreamingText('');
      setStreamingMeta(null);
      setIsStreaming(false);
    }
  }, [isStreaming, messages, pathname, contextWarning, forceDeep, snapshot]);

  // ── Handlers ──

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;

    // Slash command detection: if input starts with /
    if (val.startsWith('/')) {
      const firstSpace = val.indexOf(' ');
      const commandPart = firstSpace === -1 ? val : val.slice(0, firstSpace);
      setSlashFilter(commandPart);
      setSlashIndex(0);
    } else {
      setSlashFilter(null);
    }
  }, []);

  const handleClear = useCallback(() => {
    setMessages([]);
    setStreamingText('');
    setStreamingMeta(null);
    setInput('');
    setContextWarning(false);
  }, []);

  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    // Extract args: everything after the command word
    const firstSpace = input.indexOf(' ');
    const args = firstSpace !== -1 ? input.slice(firstSpace + 1).trim() : '';

    const expanded = typeof cmd.expand === 'function' ? cmd.expand(args) : cmd.expand;
    setSlashFilter(null);
    setInput('');
    sendMessage(expanded);
  }, [input, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command navigation
    if (slashFilter !== null && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(prev => (prev + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(prev => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectSlashCommand(filteredSlashCommands[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashFilter(null);
        return;
      }
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage(input);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Plain Enter sends for single-line inputs, shift+enter for newline
      if (!input.includes('\n') && input.trim().length > 0) {
        e.preventDefault();
        sendMessage(input);
      }
    }
  }, [input, sendMessage, slashFilter, filteredSlashCommands, slashIndex, selectSlashCommand]);

  const handleChipClick = useCallback((text: string) => sendMessage(text), [sendMessage]);

  const handleActionClick = useCallback((route: string) => {
    router.push(route);
    onClose();
  }, [router, onClose]);

  const handleRetry = useCallback(() => {
    if (lastSentRef.current) {
      setMessages(prev => prev.slice(0, -1));
      sendMessage(lastSentRef.current);
    }
  }, [sendMessage]);

  const handleAgencyClick = useCallback((route: string) => {
    router.push(route);
    onClose();
  }, [router, onClose]);

  // ── Action Execution ──

  const handleExecuteAction = useCallback(async (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg?.pendingAction) return;

    setExecutingAction(true);
    try {
      const res = await fetch('/api/ai/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: msg.pendingAction.tool_name,
          tool_input: msg.pendingAction.tool_input,
        }),
      });
      const result = await res.json();
      setMessages(prev => prev.map((m, i) =>
        i === msgIndex ? { ...m, actionResult: result } : m
      ));
    } catch (err: any) {
      setMessages(prev => prev.map((m, i) =>
        i === msgIndex ? { ...m, actionResult: { success: false, message: err.message || 'Failed to execute' } } : m
      ));
    } finally {
      setExecutingAction(false);
    }
  }, [messages]);

  const handleCancelAction = useCallback((msgIndex: number) => {
    setMessages(prev => prev.map((m, i) =>
      i === msgIndex ? { ...m, actionResult: { success: false, message: 'Cancelled by user' } } : m
    ));
  }, []);

  // Mobile swipe-to-close
  const handleTouchStart = useCallback((e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.changedTouches[0].clientY - touchStartY.current > 80) onClose();
  }, [onClose]);

  const formatTime = (date: Date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  // ── Tier display helpers ──

  const getTierDisplayName = (msg: ChatMessage) => {
    if (msg.local) return 'Instant';
    if (msg.cached) return 'Cached';
    if (msg.tierLabel) return `Claude ${msg.tierLabel}`;
    return 'Claude';
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop (desktop only) */}
      {!isMobile && (
        <div
          className="fixed inset-0 bg-black/30 z-[9998]"
          style={{ animation: 'chatFadeIn 300ms ease-out' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="AI Assistant"
        aria-modal="true"
        className={`fixed z-[9999] bg-[#0b1829] flex flex-col ${
          isMobile
            ? 'inset-0 rounded-t-2xl'
            : 'top-0 right-0 bottom-0 w-[480px] border-l border-[#d4af37]/15'
        }`}
        style={{
          animation: isMobile ? 'chatSlideUp 300ms ease-out' : 'chatSlideIn 300ms ease-out',
          willChange: 'transform',
        }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 border-b border-white/5"
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
        >
          <div className="h-14 flex items-center justify-between px-4">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-5 w-5 text-[#d4af37] flex-shrink-0" />
              <span className="text-base font-bold text-[#d4af37] truncate">DG Intelligence</span>
            </div>

            <div className="flex items-center gap-1">
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-white/5 text-white/50 border border-white/10 mr-2 truncate max-w-[140px]">
                {pageName}
              </span>

              {messages.length > 0 && (
                <button onClick={handleClear} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors" aria-label="Clear conversation">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              {!isMobile && (
                <button onClick={onMinimize} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors" aria-label="Minimize">
                  <Minus className="h-4 w-4" />
                </button>
              )}
              <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors" aria-label="Close AI assistant">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Budget bar */}
          <BudgetBar pct={budgetPct} />
        </div>

        {/* Context warning banner */}
        {contextWarning && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400/80">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            Some data sources unavailable — response may be incomplete
          </div>
        )}

        {/* Chat Area */}
        <div
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ overscrollBehavior: 'contain' }}
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
        >
          <div className="flex flex-col justify-end min-h-full">
            {/* Welcome Screen */}
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center flex-1 py-8">
                <span className="text-5xl mb-4" role="img" aria-label="sparkle">{'\u2728'}</span>
                <p className="text-lg text-white/70 mb-6 text-center">What would you like to know?</p>
                <div className={`grid gap-2 w-full max-w-sm ${suggestions.length > 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                  {suggestions.map(s => (
                    <button
                      key={s.text}
                      role="button"
                      onClick={() => handleChipClick(s.text)}
                      className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-[#d4af37]/30 text-sm text-white/80 hover:bg-[#d4af37]/10 hover:border-[#d4af37]/50 transition-all text-left min-h-[48px]"
                    >
                      <span className="text-base flex-shrink-0">{s.emoji}</span>
                      <span className="leading-tight">{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end mb-3">
                    <div
                      className="max-w-[85%] px-4 py-3 text-[15px] text-[#0a1628] leading-relaxed"
                      style={{
                        background: 'linear-gradient(135deg, #d4af37, #c4a030)',
                        borderRadius: '16px 16px 4px 16px',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col mb-3">
                    <span className="text-xs text-white/30 mb-1 ml-1 flex items-center">
                      {getTierDisplayName(msg)} &middot; {formatTime(msg.timestamp)}
                      <TierPill tier={msg.tier} tierLabel={msg.tierLabel} cached={msg.cached} local={msg.local} />
                    </span>
                    <div
                      className={`max-w-[90%] px-4 py-4 text-[15px] leading-relaxed ${
                        msg.isError
                          ? 'bg-red-500/10 text-red-300 border border-red-500/20'
                          : msg.queued
                            ? 'bg-amber-500/10 text-amber-300 border border-dashed border-amber-500/30'
                            : 'bg-white/5 text-white'
                      }`}
                      style={{ borderRadius: '16px 16px 16px 4px' }}
                    >
                      {msg.queued && <WifiOff className="h-4 w-4 text-amber-400 mb-2" />}
                      {msg.content && <MarkdownContent text={msg.content} onAgencyClick={handleAgencyClick} />}
                    </div>

                    {/* Action confirmation card */}
                    {msg.pendingAction && (
                      <ActionCard
                        action={msg.pendingAction}
                        onExecute={() => handleExecuteAction(i)}
                        onCancel={() => handleCancelAction(i)}
                        result={msg.actionResult}
                        executing={executingAction}
                      />
                    )}

                    {/* Interrupted indicator + Retry */}
                    {msg.interrupted && (
                      <div className="flex items-center gap-2 mt-2 ml-1">
                        <span className="text-xs text-amber-400/70">Response interrupted</span>
                        <button
                          onClick={handleRetry}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] text-xs font-medium hover:bg-[#d4af37]/20 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </button>
                      </div>
                    )}

                    {/* Action buttons */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        {msg.actions.map((action, j) => (
                          <button
                            key={j}
                            role="button"
                            onClick={() => handleActionClick(action.route)}
                            className="flex items-center justify-center gap-2 w-full h-11 rounded-lg border border-[#d4af37]/40 text-[#d4af37] text-sm font-medium hover:bg-[#d4af37]/10 transition-colors"
                          >
                            {action.label}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Follow-up suggestion chips */}
                    {msg.suggestions && msg.suggestions.length > 0 && i === messages.length - 1 && !isStreaming && (
                      <div className="flex gap-2 mt-3 ml-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                        {msg.suggestions.map((s, j) => (
                          <button
                            key={j}
                            role="button"
                            onClick={() => handleChipClick(s)}
                            className="flex-shrink-0 px-3 py-2 rounded-2xl border border-[#d4af37]/30 text-xs text-white/70 hover:bg-[#d4af37]/10 hover:border-[#d4af37]/50 transition-all whitespace-nowrap min-h-[36px]"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Streaming message */}
            {isStreaming && streamingText && (
              <div className="flex flex-col mb-3">
                <span className="text-xs text-white/30 mb-1 ml-1 flex items-center">
                  {streamingMeta?.local ? 'Instant' : streamingMeta?.cached ? 'Cached' : `Claude ${streamingMeta?.tierLabel || ''}`}
                  {streamingMeta && (
                    <TierPill tier={streamingMeta.tier} tierLabel={streamingMeta.tierLabel} cached={streamingMeta.cached} local={streamingMeta.local} />
                  )}
                </span>
                <div
                  className="max-w-[90%] px-4 py-4 bg-white/5 text-[15px] text-white leading-relaxed"
                  style={{ borderRadius: '16px 16px 16px 4px' }}
                >
                  <MarkdownContent text={streamingText} onAgencyClick={handleAgencyClick} />
                  <span
                    className="inline-block w-0.5 h-4 bg-[#d4af37] ml-0.5 align-middle"
                    style={{ animation: 'chatCursorBlink 1s ease-in-out infinite' }}
                  />
                </div>
              </div>
            )}

            {isStreaming && !streamingText && <TypingIndicator />}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div
          className="flex-shrink-0 px-4 pt-3 border-t border-white/5"
          style={{
            background: 'rgba(15, 25, 50, 0.9)',
            backdropFilter: 'blur(10px)',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          }}
        >
          {/* Deep Analysis toggle */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setForceDeep(prev => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                forceDeep
                  ? 'bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/40'
                  : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/60'
              }`}
            >
              <Zap className="h-3 w-3" />
              Deep Analysis
            </button>
            {forceDeep && (
              <span className="text-xs text-[#d4af37]/60">Next message uses Opus</span>
            )}
          </div>

          {/* Slash command dropdown */}
          {slashFilter !== null && filteredSlashCommands.length > 0 && (
            <div className="mb-2 rounded-xl border border-[#d4af37]/20 bg-[#0f1935] overflow-hidden max-h-[240px] overflow-y-auto">
              {filteredSlashCommands.map((cmd, i) => (
                <button
                  key={cmd.command}
                  onMouseDown={(e) => { e.preventDefault(); selectSlashCommand(cmd); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === slashIndex ? 'bg-[#d4af37]/10' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="text-sm font-mono text-[#d4af37] min-w-[110px]">{cmd.command}</span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm text-white/80 truncate">{cmd.label}</span>
                    <span className="text-xs text-white/40 truncate">{cmd.description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={PLACEHOLDERS[placeholderIdx]}
              disabled={isStreaming}
              rows={1}
              aria-label="Ask the AI assistant"
              className="w-full min-h-[44px] max-h-[120px] resize-none rounded-xl bg-white/5 border border-white/10 focus:border-[#d4af37]/50 focus:outline-none text-white text-[15px] placeholder:text-white/30 px-4 py-3 pr-12 transition-colors disabled:opacity-50"
              style={{ fontSize: '16px' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              aria-label="Send message"
              className={`absolute right-2 bottom-2 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
                input.trim() && !isStreaming
                  ? 'opacity-100 scale-100'
                  : 'opacity-0 scale-75 pointer-events-none'
              }`}
              style={{ background: 'linear-gradient(135deg, #d4af37, #c4a030)' }}
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 text-[#0a1628] animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4 text-[#0a1628]" />
              )}
            </button>
          </div>
          <p className="text-xs text-white/20 text-center mt-2 mb-1">
            Type <span className="text-white/30">/</span> for commands {'\u00B7'} {'\u2318'}+Enter to send
          </p>
        </div>
      </div>

      {/* Animations */}
      <style jsx global>{`
        @keyframes chatSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes chatSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes chatFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes chatBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes chatCursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
