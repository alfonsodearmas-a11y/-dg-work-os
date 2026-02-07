'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X, Minus, Trash2, ArrowUp, Loader2, Sparkles, ExternalLink, RotateCcw, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  actions?: Array<{ label: string; route: string }>;
  interrupted?: boolean;
  isError?: boolean;
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
  '/intel/gwi': [
    { emoji: '\u{1F4CA}', text: "Summarize GWI's financial performance" },
    { emoji: '\u{1F4B0}', text: 'Why are only 46% of customers paying on time?' },
    { emoji: '\u{1F4C8}', text: "What's driving the 190% procurement spike?" },
    { emoji: '\u{2705}', text: "Is GWI's complaint resolution improving?" },
  ],
  '/intel/gpl': [
    { emoji: '\u{26A1}', text: 'Which stations need attention?' },
    { emoji: '\u{1F50B}', text: 'Is reserve margin adequate?' },
    { emoji: '\u{1F4C9}', text: 'Analyze system loss trends' },
    { emoji: '\u{1F3D7}\u{FE0F}', text: 'GPL infrastructure project status' },
  ],
  '/projects': [
    { emoji: '\u{26A0}\u{FE0F}', text: 'Which delayed projects are most critical?' },
    { emoji: '\u{1F5FA}\u{FE0F}', text: 'Summarize projects by region' },
    { emoji: '\u{1F4B0}', text: "What's the total delayed project value?" },
    { emoji: '\u{1F4CA}', text: 'Compare agency project execution' },
  ],
  '/': [
    { emoji: '\u{2600}\u{FE0F}', text: 'What needs my attention today?' },
    { emoji: '\u{1F4C5}', text: "Summarize this week's schedule" },
    { emoji: '\u{23F0}', text: 'What tasks are overdue?' },
    { emoji: '\u{1F4CB}', text: 'Brief me on all agencies' },
  ],
};

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
  '/': 'Daily Briefing',
  '/intel': 'Agency Intel',
  '/intel/gpl': 'GPL Dashboard',
  '/intel/gwi': 'GWI Dashboard',
  '/intel/cjia': 'CJIA Dashboard',
  '/intel/gcaa': 'GCAA Dashboard',
  '/projects': 'Project Tracker',
  '/documents': 'Document Vault',
  '/calendar': 'Calendar',
  '/admin': 'Admin',
  '/tasks': 'Tasks',
};

const AGENCY_ROUTES: Record<string, string> = {
  GPL: '/intel/gpl',
  GWI: '/intel/gwi',
  CJIA: '/intel/cjia',
  GCAA: '/intel/gcaa',
};

// ── Markdown Renderer ────────────────────────────────────────────────────────

function renderInline(text: string, onAgencyClick?: (route: string) => void): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code`, and standalone agency names
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\b(GPL|GWI|CJIA|GCAA)\b)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold with gold highlight
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
      // Agency name — clickable link
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
      // Agency name without handler — render plain
      nodes.push(match[7]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function MarkdownContent({ text, onAgencyClick }: { text: string; onAgencyClick?: (route: string) => void }) {
  const blocks = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;
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

  for (const line of blocks) {
    const trimmed = line.trim();

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

// ── Main Component ───────────────────────────────────────────────────────────

export function ChatPanel({ isOpen, onClose, onMinimize }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [streamingText, setStreamingText] = useState('');
  const [contextWarning, setContextWarning] = useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSentRef = useRef<string>('');
  const autoBriefingFired = useRef(false);
  const touchStartY = useRef(0);

  // ── Derived ──

  const pageName = useMemo(() => {
    if (PAGE_NAMES[pathname]) return PAGE_NAMES[pathname];
    if (pathname.startsWith('/projects/')) return 'Project Detail';
    if (pathname.startsWith('/documents/')) return 'Document';
    if (pathname.startsWith('/intel/')) return 'Agency Intel';
    return 'DG Work OS';
  }, [pathname]);

  const suggestions = useMemo(() => {
    // Check exact match first, then prefixes for sub-routes
    if (PAGE_SUGGESTIONS[pathname]) return PAGE_SUGGESTIONS[pathname];
    if (pathname.startsWith('/projects')) return PAGE_SUGGESTIONS['/projects'];
    if (pathname.startsWith('/intel/gwi')) return PAGE_SUGGESTIONS['/intel/gwi'];
    if (pathname.startsWith('/intel/gpl')) return PAGE_SUGGESTIONS['/intel/gpl'];
    return DEFAULT_SUGGESTIONS;
  }, [pathname]);

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

  // ── Morning auto-briefing ──

  const sendMessage = useCallback(async (text: string, isAutoBriefing = false) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');
    setContextWarning(false);
    lastSentRef.current = text.trim();

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

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
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }));
        const errMsg = errData.error || `HTTP ${res.status}`;

        // Specific error messages
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'text') {
              accumulated += event.text;
              setStreamingText(accumulated);

              // Detect context warning in streaming text
              if (!contextWarning && (accumulated.includes('data sources unavailable') || accumulated.includes('unavailable') && accumulated.includes('data'))) {
                setContextWarning(true);
              }
            } else if (event.type === 'done') {
              const { clean: c1, suggestions: sug } = parseSuggestions(accumulated);
              const { clean: c2, actions } = parseActions(c1);
              setMessages(prev => [...prev, { role: 'assistant', content: c2, timestamp: new Date(), suggestions: sug, actions }]);
              setStreamingText('');
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
        }]);
        setStreamingText('');
        setIsStreaming(false);
      } else if (!streamComplete && !accumulated) {
        // No text received at all
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Response interrupted before any content was received.',
          timestamp: new Date(), isError: true, interrupted: true,
        }]);
        setStreamingText('');
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
      setIsStreaming(false);
    }
  }, [isStreaming, messages, pathname, contextWarning]);

  // Fire auto-briefing on first open each day
  useEffect(() => {
    if (!isOpen || autoBriefingFired.current || messages.length > 0 || isStreaming) return;

    const today = new Date().toISOString().slice(0, 10);
    const storageKey = `ai-briefing-${today}`;

    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch { return; }

    autoBriefingFired.current = true;

    const hour = new Date().getHours();
    const greeting = hour < 12
      ? 'Good morning. What needs my attention today?'
      : 'What needs my attention right now?';

    try { sessionStorage.setItem(storageKey, 'true'); } catch { /* noop */ }

    // Small delay so the panel animation finishes
    setTimeout(() => sendMessage(greeting, true), 500);
  }, [isOpen, messages.length, isStreaming, sendMessage]);

  // ── Handlers ──

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleClear = useCallback(() => {
    setMessages([]);
    setStreamingText('');
    setInput('');
    setContextWarning(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  const handleChipClick = useCallback((text: string) => sendMessage(text), [sendMessage]);

  const handleActionClick = useCallback((route: string) => {
    router.push(route);
    onClose();
  }, [router, onClose]);

  const handleRetry = useCallback(() => {
    if (lastSentRef.current) {
      // Remove the interrupted/error message
      setMessages(prev => prev.slice(0, -1));
      sendMessage(lastSentRef.current);
    }
  }, [sendMessage]);

  const handleAgencyClick = useCallback((route: string) => {
    router.push(route);
    onClose();
  }, [router, onClose]);

  // Mobile swipe-to-close
  const handleTouchStart = useCallback((e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.changedTouches[0].clientY - touchStartY.current > 80) onClose();
  }, [onClose]);

  const formatTime = (date: Date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

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
          className="h-14 flex items-center justify-between px-4 border-b border-white/5 flex-shrink-0"
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 text-[#d4af37] flex-shrink-0" />
            <span className="text-base font-bold text-[#d4af37] truncate">DG Intelligence</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] bg-white/5 text-white/50 border border-white/10 mr-2 truncate max-w-[140px]">
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
                    <span className="text-[11px] text-white/30 mb-1 ml-1">
                      Claude Opus &middot; {formatTime(msg.timestamp)}
                    </span>
                    <div
                      className={`max-w-[90%] px-4 py-4 text-[15px] leading-relaxed ${
                        msg.isError
                          ? 'bg-red-500/10 text-red-300 border border-red-500/20'
                          : 'bg-white/5 text-white'
                      }`}
                      style={{ borderRadius: '16px 16px 16px 4px' }}
                    >
                      <MarkdownContent text={msg.content} onAgencyClick={handleAgencyClick} />
                    </div>

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

                    {/* Action buttons — full width */}
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
                <span className="text-[11px] text-white/30 mb-1 ml-1">Claude Opus</span>
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
          <p className="text-[10px] text-white/20 text-center mt-2 mb-1">
            Claude Opus {'\u00B7'} Powered by Anthropic
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
