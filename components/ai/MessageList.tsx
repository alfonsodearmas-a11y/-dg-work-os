'use client';

import { useRef, useEffect } from 'react';
import { ExternalLink, RotateCcw, WifiOff } from 'lucide-react';
import type { ModelTier } from '@/lib/ai/types';
import type { ChatMessage } from './chat-types';
import { TIER_COLORS, formatTime, getTierDisplayName } from './chat-types';
import { MarkdownContent } from './MarkdownContent';
import { ToolResultDisplay } from './ToolResultDisplay';

// ── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="px-4 py-3 rounded-2xl rounded-bl bg-white/5 flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-gold-500"
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

// ── Message List ──────────────────────────────────────────────────────────────

export interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  streamingMeta: { tier?: ModelTier; tierLabel?: string; cached?: boolean; local?: boolean } | null;
  suggestions: Array<{ emoji: string; text: string }>;
  executingAction: boolean;
  onChipClick: (text: string) => void;
  onActionClick: (route: string) => void;
  onAgencyClick: (route: string) => void;
  onRetry: () => void;
  onExecuteAction: (msgIndex: number) => void;
  onCancelAction: (msgIndex: number) => void;
}

export function MessageList({
  messages,
  isStreaming,
  streamingText,
  streamingMeta,
  suggestions,
  executingAction,
  onChipClick,
  onActionClick,
  onAgencyClick,
  onRetry,
  onExecuteAction,
  onCancelAction,
}: MessageListProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
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
                  onClick={() => onChipClick(s.text)}
                  className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-gold-500/30 text-sm text-white/80 hover:bg-gold-500/10 hover:border-gold-500/50 transition-all text-left min-h-[48px]"
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
                  className="max-w-[85%] px-4 py-3 text-[15px] text-navy-950 leading-relaxed"
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
                  {msg.content && <MarkdownContent text={msg.content} onAgencyClick={onAgencyClick} />}
                </div>

                {/* Action confirmation card */}
                {msg.pendingAction && (
                  <ToolResultDisplay
                    action={msg.pendingAction}
                    onExecute={() => onExecuteAction(i)}
                    onCancel={() => onCancelAction(i)}
                    result={msg.actionResult}
                    executing={executingAction}
                  />
                )}

                {/* Interrupted indicator + Retry */}
                {msg.interrupted && (
                  <div className="flex items-center gap-2 mt-2 ml-1">
                    <span className="text-xs text-amber-400/70">Response interrupted</span>
                    <button
                      onClick={onRetry}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gold-500/10 border border-gold-500/30 text-gold-500 text-xs font-medium hover:bg-gold-500/20 transition-colors"
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
                        onClick={() => onActionClick(action.route)}
                        className="flex items-center justify-center gap-2 w-full h-11 rounded-lg border border-gold-500/40 text-gold-500 text-sm font-medium hover:bg-gold-500/10 transition-colors"
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
                        onClick={() => onChipClick(s)}
                        className="flex-shrink-0 px-3 py-2 rounded-2xl border border-gold-500/30 text-xs text-white/70 hover:bg-gold-500/10 hover:border-gold-500/50 transition-all whitespace-nowrap min-h-[36px]"
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
              <MarkdownContent text={streamingText} onAgencyClick={onAgencyClick} />
              <span
                className="inline-block w-0.5 h-4 bg-gold-500 ml-0.5 align-middle"
                style={{ animation: 'chatCursorBlink 1s ease-in-out infinite' }}
              />
            </div>
          </div>
        )}

        {isStreaming && !streamingText && <TypingIndicator />}

        <div ref={chatEndRef} />
      </div>
    </div>
  );
}
