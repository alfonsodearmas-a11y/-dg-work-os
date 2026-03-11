'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ArrowUp, Loader2, Zap } from 'lucide-react';
import type { SlashCommand } from './chat-types';
import { SLASH_COMMANDS, PLACEHOLDERS } from './chat-types';

// ── Chat Input ───────────────────────────────────────────────────────────────

export interface ChatInputProps {
  isStreaming: boolean;
  isMobile: boolean;
  forceDeep: boolean;
  onForceDeepToggle: () => void;
  onSendMessage: (text: string) => void;
}

export function ChatInput({
  isStreaming,
  isMobile,
  forceDeep,
  onForceDeepToggle,
  onSendMessage,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [slashFilter, setSlashFilter] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Placeholder rotation
  useEffect(() => {
    const timer = setInterval(() => setPlaceholderIdx(prev => (prev + 1) % PLACEHOLDERS.length), 5000);
    return () => clearInterval(timer);
  }, []);

  // Focus textarea when not mobile (on mount)
  useEffect(() => {
    if (!isMobile) {
      setTimeout(() => textareaRef.current?.focus(), 350);
    }
  }, [isMobile]);

  const filteredSlashCommands = useMemo(() => {
    if (slashFilter === null) return [];
    const q = slashFilter.toLowerCase();
    return SLASH_COMMANDS.filter(c =>
      c.command.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
    );
  }, [slashFilter]);

  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    // Extract args: everything after the command word
    const firstSpace = input.indexOf(' ');
    const args = firstSpace !== -1 ? input.slice(firstSpace + 1).trim() : '';

    const expanded = typeof cmd.expand === 'function' ? cmd.expand(args) : cmd.expand;
    setSlashFilter(null);
    setInput('');
    onSendMessage(expanded);
  }, [input, onSendMessage]);

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

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSendMessage(text);
  }, [input, isStreaming, onSendMessage]);

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
      handleSend();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Plain Enter sends for single-line inputs, shift+enter for newline
      if (!input.includes('\n') && input.trim().length > 0) {
        e.preventDefault();
        handleSend();
      }
    }
  }, [input, handleSend, slashFilter, filteredSlashCommands, slashIndex, selectSlashCommand]);

  /** Allow parent to re-focus the textarea (e.g., after panel opens) */
  useEffect(() => {
    if (!isMobile) {
      textareaRef.current?.focus();
    }
  }, [isMobile]);

  return (
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
          onClick={onForceDeepToggle}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            forceDeep
              ? 'bg-gold-500/20 text-gold-500 border border-gold-500/40'
              : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/60'
          }`}
        >
          <Zap className="h-3 w-3" />
          Deep Analysis
        </button>
        {forceDeep && (
          <span className="text-xs text-gold-500/60">Next message uses Opus</span>
        )}
      </div>

      {/* Slash command dropdown */}
      {slashFilter !== null && filteredSlashCommands.length > 0 && (
        <div className="mb-2 rounded-xl border border-gold-500/20 bg-[#0f1935] overflow-hidden max-h-[240px] overflow-y-auto">
          {filteredSlashCommands.map((cmd, i) => (
            <button
              key={cmd.command}
              onMouseDown={(e) => { e.preventDefault(); selectSlashCommand(cmd); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === slashIndex ? 'bg-gold-500/10' : 'hover:bg-white/5'
              }`}
            >
              <span className="text-sm font-mono text-gold-500 min-w-[110px]">{cmd.command}</span>
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
          className="w-full min-h-[44px] max-h-[120px] resize-none rounded-xl bg-white/5 border border-white/10 focus:border-gold-500/50 focus:outline-none text-white text-[15px] placeholder:text-white/30 px-4 py-3 pr-12 transition-colors disabled:opacity-50"
          style={{ fontSize: '16px' }}
        />
        <button
          onClick={handleSend}
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
            <Loader2 className="h-4 w-4 text-navy-950 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4 text-navy-950" />
          )}
        </button>
      </div>
      <p className="text-xs text-white/20 text-center mt-2 mb-1">
        Type <span className="text-white/30">/</span> for commands {'\u00B7'} {'\u2318'}+Enter to send
      </p>
    </div>
  );
}
