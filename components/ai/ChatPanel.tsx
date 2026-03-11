'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/useIsMobile';
import { tryLocalAnswer } from '@/lib/ai/local-answers';
import { saveToOffline } from '@/lib/offline/offline-store';
import type { MetricSnapshot, ModelTier, ChatStreamEvent } from '@/lib/ai/types';
import type { ChatMessage } from './chat-types';
import {
  DEFAULT_SUGGESTIONS,
  PAGE_SUGGESTIONS,
  PAGE_NAMES,
  parseSuggestions,
  parseActions,
} from './chat-types';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ChatPanel({ isOpen, onClose, onMinimize }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingMeta, setStreamingMeta] = useState<{ tier?: ModelTier; tierLabel?: string; cached?: boolean; local?: boolean } | null>(null);
  const [contextWarning, setContextWarning] = useState(false);
  const [forceDeep, setForceDeep] = useState(false);
  const [budgetPct, setBudgetPct] = useState(0);
  const [snapshot, setSnapshot] = useState<MetricSnapshot | null>(null);
  const [executingAction, setExecutingAction] = useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
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
    setIsStreaming(true);
    setStreamingText('');
    setStreamingMeta(null);
    setContextWarning(false);
    lastSentRef.current = text.trim();

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

  const handleClear = useCallback(() => {
    setMessages([]);
    setStreamingText('');
    setStreamingMeta(null);
    setContextWarning(false);
  }, []);

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

  const handleForceDeepToggle = useCallback(() => setForceDeep(prev => !prev), []);

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
            : 'top-0 right-0 bottom-0 w-[480px] border-l border-gold-500/15'
        }`}
        style={{
          animation: isMobile ? 'chatSlideUp 300ms ease-out' : 'chatSlideIn 300ms ease-out',
          willChange: 'transform',
        }}
      >
        <ChatHeader
          pageName={pageName}
          hasMessages={messages.length > 0}
          isMobile={isMobile}
          budgetPct={budgetPct}
          contextWarning={contextWarning}
          onClear={handleClear}
          onMinimize={onMinimize}
          onClose={onClose}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        />

        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          streamingText={streamingText}
          streamingMeta={streamingMeta}
          suggestions={suggestions}
          executingAction={executingAction}
          onChipClick={handleChipClick}
          onActionClick={handleActionClick}
          onAgencyClick={handleAgencyClick}
          onRetry={handleRetry}
          onExecuteAction={handleExecuteAction}
          onCancelAction={handleCancelAction}
        />

        <ChatInput
          isStreaming={isStreaming}
          isMobile={isMobile}
          forceDeep={forceDeep}
          onForceDeepToggle={handleForceDeepToggle}
          onSendMessage={sendMessage}
        />
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
