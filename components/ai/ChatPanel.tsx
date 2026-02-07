'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X, Minus, Trash2, ArrowUp, Loader2, Sparkles, ExternalLink } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  actions?: Array<{ label: string; route: string }>;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const INITIAL_SUGGESTIONS = [
  { emoji: '\u{1F4CA}', text: 'What needs my attention today?' },
  { emoji: '\u{26A0}\u{FE0F}', text: 'Show me all critical issues' },
  { emoji: '\u{1F4C8}', text: 'Compare agency health scores' },
  { emoji: '\u{1F3D7}\u{FE0F}', text: 'Delayed project summary' },
  { emoji: '\u{1F4B0}', text: 'Financial overview across agencies' },
  { emoji: '\u{1F4CB}', text: 'My overdue tasks' },
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

// ── Markdown Renderer ────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code`, and plain text
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
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
      // Italic
      nodes.push(<em key={key++} className="italic text-white/80">{match[4]}</em>);
    } else if (match[5]) {
      // Inline code
      nodes.push(
        <code key={key++} className="px-1.5 py-0.5 rounded bg-white/10 text-[#d4af37] text-[13px] font-mono">
          {match[6]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function MarkdownContent({ text }: { text: string }) {
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

    // Empty line
    if (!trimmed) {
      flushList();
      continue;
    }

    // Unordered list
    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(<li key={key++} className="text-white/90">{renderInline(ulMatch[1])}</li>);
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(<li key={key++} className="text-white/90">{renderInline(olMatch[1])}</li>);
      continue;
    }

    // Not a list item — flush any pending list
    flushList();

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={key++} className="text-sm font-semibold text-[#d4af37] mt-3 mb-1">{renderInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={key++} className="text-base font-semibold text-[#d4af37] mt-3 mb-1">{renderInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<h2 key={key++} className="text-lg font-bold text-[#d4af37] mt-3 mb-1">{renderInline(trimmed.slice(2))}</h2>);
    } else {
      // Regular paragraph line
      elements.push(<p key={key++} className="my-1 leading-relaxed">{renderInline(trimmed)}</p>);
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
            style={{
              animation: 'chatBounce 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }}
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
    const clean = text.replace(match[0], '').trim();
    return { clean, suggestions };
  } catch {
    return { clean: text, suggestions: [] };
  }
}

function parseActions(text: string): { clean: string; actions: Array<{ label: string; route: string }> } {
  const actions: Array<{ label: string; route: string }> = [];
  let clean = text;

  const regex = /<!--\s*action:\s*(\{[^}]*?\})\s*-->/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    try {
      const action = JSON.parse(match[1]) as { label: string; route: string };
      actions.push(action);
      clean = clean.replace(match[0], '');
    } catch { /* skip malformed */ }
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

  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Swipe-to-close for mobile
  const touchStartY = useRef(0);

  const pageName = useMemo(() => {
    // Try exact match, then prefix match for dynamic routes
    if (PAGE_NAMES[pathname]) return PAGE_NAMES[pathname];
    if (pathname.startsWith('/projects/')) return 'Project Detail';
    if (pathname.startsWith('/documents/')) return 'Document';
    if (pathname.startsWith('/intel/')) return 'Agency Intel';
    return 'DG Work OS';
  }, [pathname]);

  // Rotate placeholder
  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIdx(prev => (prev + 1) % PLACEHOLDERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen && !isMobile) {
      setTimeout(() => textareaRef.current?.focus(), 350);
    }
  }, [isOpen, isMobile]);

  // Prevent body scroll when panel is open on mobile
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isMobile, isOpen]);

  // Auto-grow textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  // Clear conversation
  const handleClear = useCallback(() => {
    setMessages([]);
    setStreamingText('');
    setInput('');
  }, []);

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
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
          conversation_history: history.slice(0, -1), // exclude the current user message
          current_page: pathname,
          session_id: 'dg-session',
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'text') {
              accumulated += event.text;
              setStreamingText(accumulated);
            } else if (event.type === 'done') {
              // Parse suggestions and actions from accumulated text
              const { clean: c1, suggestions } = parseSuggestions(accumulated);
              const { clean: c2, actions } = parseActions(c1);

              const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: c2,
                timestamp: new Date(),
                suggestions,
                actions,
              };

              setMessages(prev => [...prev, assistantMessage]);
              setStreamingText('');
              setIsStreaming(false);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }

      // If stream ended without a 'done' event
      if (accumulated && isStreaming) {
        const { clean: c1, suggestions } = parseSuggestions(accumulated);
        const { clean: c2, actions } = parseActions(c1);

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: c2,
          timestamp: new Date(),
          suggestions,
          actions,
        }]);
        setStreamingText('');
        setIsStreaming(false);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[Chat] Error:', err);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I encountered an error: ${err.message}. Please try again.`,
        timestamp: new Date(),
      }]);
      setStreamingText('');
      setIsStreaming(false);
    }
  }, [isStreaming, messages, pathname]);

  // Keyboard: Enter sends, Shift+Enter newline
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  // Handle chip click
  const handleChipClick = useCallback((text: string) => {
    sendMessage(text);
  }, [sendMessage]);

  // Handle action click
  const handleActionClick = useCallback((route: string) => {
    router.push(route);
    onClose();
  }, [router, onClose]);

  // Mobile swipe-to-close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (deltaY > 80) onClose();
  }, [onClose]);

  // Time formatter
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop (desktop only) */}
      {!isMobile && (
        <div
          className="fixed inset-0 bg-black/30 z-[9998] transition-opacity duration-300"
          style={{ animation: 'chatFadeIn 300ms ease-out' }}
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
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
          ref={headerRef}
          className="h-14 flex items-center justify-between px-4 border-b border-white/5 flex-shrink-0"
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 text-[#d4af37] flex-shrink-0" />
            <span className="text-base font-bold text-[#d4af37] truncate">DG Intelligence</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Context badge */}
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] bg-white/5 text-white/50 border border-white/10 mr-2 truncate max-w-[140px]">
              {pageName}
            </span>

            {messages.length > 0 && (
              <button onClick={handleClear} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors" title="Clear conversation">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {!isMobile && (
              <button onClick={onMinimize} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors" title="Minimize">
                <Minus className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors" title="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ overscrollBehavior: 'contain' }}>
          <div className="flex flex-col justify-end min-h-full">
            {/* Welcome Screen */}
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center flex-1 py-8">
                <span className="text-5xl mb-4" role="img" aria-label="sparkle">{'\u2728'}</span>
                <p className="text-lg text-white/70 mb-6 text-center">What would you like to know?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-sm">
                  {INITIAL_SUGGESTIONS.map(s => (
                    <button
                      key={s.text}
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
                  // User message
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
                  // AI message
                  <div className="flex flex-col mb-3">
                    <span className="text-[11px] text-white/30 mb-1 ml-1">
                      Claude Opus &middot; {formatTime(msg.timestamp)}
                    </span>
                    <div
                      className="max-w-[90%] px-4 py-4 bg-white/5 text-[15px] text-white leading-relaxed"
                      style={{ borderRadius: '16px 16px 16px 4px' }}
                    >
                      <MarkdownContent text={msg.content} />
                    </div>

                    {/* Action buttons */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2 ml-1">
                        {msg.actions.map((action, j) => (
                          <button
                            key={j}
                            onClick={() => handleActionClick(action.route)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d4af37]/40 text-[#d4af37] text-xs font-medium hover:bg-[#d4af37]/10 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {action.label}
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
                  <MarkdownContent text={streamingText} />
                  <span
                    className="inline-block w-0.5 h-4 bg-[#d4af37] ml-0.5 align-middle"
                    style={{ animation: 'chatCursorBlink 1s ease-in-out infinite' }}
                  />
                </div>
              </div>
            )}

            {/* Typing indicator (before any text arrives) */}
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
              className="w-full min-h-[44px] max-h-[120px] resize-none rounded-xl bg-white/5 border border-white/10 focus:border-[#d4af37]/50 focus:outline-none text-white text-[15px] placeholder:text-white/30 px-4 py-3 pr-12 transition-colors disabled:opacity-50"
              style={{ fontSize: '16px' /* prevents iOS zoom */ }}
            />
            {/* Send button */}
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
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
          {/* Rate limit note */}
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
