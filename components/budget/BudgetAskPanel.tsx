'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Send, Loader2 } from 'lucide-react';

export function BudgetAskPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setContent('');
      setQuestion('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isStreaming) return;

    const q = question.trim();
    setQuestion('');
    setIsStreaming(true);
    setContent('');

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/budget/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              accumulated += data.text;
              setContent(accumulated);
            }
            if (data.done) setIsStreaming(false);
            if (data.error) {
              accumulated += `\n\n**Error:** ${data.error}`;
              setContent(accumulated);
              setIsStreaming(false);
            }
          } catch {}
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setContent(`**Error:** ${e}`);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { abortRef.current?.abort(); onClose(); }} />

      <div className="relative w-full md:max-w-2xl md:max-h-[80vh] bg-gradient-to-b from-[#1a2744] to-[#0a1628] border border-[#2d3a52] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up md:animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2d3a52] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#d4af37]/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-[#d4af37]" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Ask About the Budget</h3>
              <p className="text-[#64748b] text-[10px]">Powered by Claude Opus 4.6</p>
            </div>
          </div>
          <button onClick={() => { abortRef.current?.abort(); onClose(); }} className="p-1.5 rounded-lg hover:bg-[#2d3a52] text-[#64748b] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4 min-h-[200px]" style={{ WebkitOverflowScrolling: 'touch' }}>
          {content ? (
            <>
              <div className="ai-brief-content" dangerouslySetInnerHTML={{ __html: simpleMarkdown(content) }} />
              {isStreaming && <span className="inline-block w-2 h-4 bg-[#d4af37] animate-pulse ml-0.5" />}
            </>
          ) : isStreaming ? (
            <div className="flex items-center gap-3 text-[#64748b]">
              <Loader2 className="h-5 w-5 animate-spin text-[#d4af37]" />
              <span className="text-sm">Thinking...</span>
            </div>
          ) : (
            <div className="text-center py-8 space-y-3">
              <p className="text-[#64748b] text-sm">Ask any question about the 2026 Budget Estimates</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'What is GPL\'s total capital expenditure?',
                  'Compare water vs energy budgets',
                  'What are CJIA\'s capital projects?',
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setQuestion(q); }}
                    className="px-3 py-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-[#94a3b8] text-xs hover:border-[#d4af37] hover:text-white transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-[#2d3a52] shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask about the budget..."
              className="input-premium flex-1 text-sm py-2"
              disabled={isStreaming}
            />
            <button
              type="submit"
              disabled={isStreaming || !question.trim()}
              className="px-3 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] font-semibold disabled:opacity-40 hover:bg-[#f4d03f] transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function simpleMarkdown(text: string): string {
  return text
    .replace(/^## (.+)/gm, '<h3 class="text-[#d4af37] font-semibold text-base mt-4 mb-2">$1</h3>')
    .replace(/^### (.+)/gm, '<h4 class="text-white font-semibold text-sm mt-3 mb-1">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/G\$[\d,.]+[BMK]/g, '<span class="text-[#d4af37] font-mono font-semibold">$&</span>')
    .replace(/V\dp\d+/g, '<span class="text-blue-400 text-xs">$&</span>')
    .replace(/^[-•]\s+(.+)/gm, '<li class="text-[#94a3b8] text-sm ml-4">$1</li>')
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="space-y-1 my-2">$1</ul>')
    .replace(/\n/g, '<br/>');
}
