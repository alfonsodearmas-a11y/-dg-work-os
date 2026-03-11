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
  const budgetAskRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setContent('');
      setQuestion('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { abortRef.current?.abort(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { abortRef.current?.abort(); onClose(); }} aria-hidden="true" />

      <div ref={budgetAskRef} role="dialog" aria-modal="true" aria-labelledby="budget-ask-panel-title" className="relative w-full md:max-w-2xl md:max-h-[80vh] bg-gradient-to-b from-[#1a2744] to-[#0a1628] border border-navy-800 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up md:animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-navy-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold-500/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-gold-500" />
            </div>
            <div>
              <h3 id="budget-ask-panel-title" className="text-white font-semibold text-sm">Ask About the Budget</h3>
              <p className="text-navy-600 text-[10px]">Powered by Claude Opus 4.6</p>
            </div>
          </div>
          <button onClick={() => { abortRef.current?.abort(); onClose(); }} aria-label="Close" className="p-1.5 rounded-lg hover:bg-navy-800 text-navy-600 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4 min-h-[200px]" style={{ WebkitOverflowScrolling: 'touch' }}>
          {content ? (
            <>
              <div className="ai-brief-content" dangerouslySetInnerHTML={{ __html: simpleMarkdown(content) }} />
              {isStreaming && <span className="inline-block w-2 h-4 bg-gold-500 animate-pulse ml-0.5" />}
            </>
          ) : isStreaming ? (
            <div className="flex items-center gap-3 text-navy-600">
              <Loader2 className="h-5 w-5 animate-spin text-gold-500" />
              <span className="text-sm">Thinking...</span>
            </div>
          ) : (
            <div className="text-center py-8 space-y-3">
              <p className="text-navy-600 text-sm">Ask any question about the 2026 Budget Estimates</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'What is GPL\'s total capital expenditure?',
                  'Compare water vs energy budgets',
                  'What are CJIA\'s capital projects?',
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setQuestion(q); }}
                    className="px-3 py-1.5 rounded-lg bg-navy-950 border border-navy-800 text-slate-400 text-xs hover:border-gold-500 hover:text-white transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-navy-800 shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask about the budget..."
              aria-label="Ask a question about the budget"
              className="input-premium flex-1 text-sm py-2"
              disabled={isStreaming}
            />
            <button
              type="submit"
              disabled={isStreaming || !question.trim()}
              className="px-3 py-2 rounded-lg bg-gold-500 text-navy-950 font-semibold disabled:opacity-40 hover:bg-gold-400 transition-colors"
              aria-label="Send"
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
    .replace(/^## (.+)/gm, '<h3 class="text-gold-500 font-semibold text-base mt-4 mb-2">$1</h3>')
    .replace(/^### (.+)/gm, '<h4 class="text-white font-semibold text-sm mt-3 mb-1">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/G\$[\d,.]+[BMK]/g, '<span class="text-gold-500 font-mono font-semibold">$&</span>')
    .replace(/V\dp\d+/g, '<span class="text-blue-400 text-xs">$&</span>')
    .replace(/^[-•]\s+(.+)/gm, '<li class="text-slate-400 text-sm ml-4">$1</li>')
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="space-y-1 my-2">$1</ul>')
    .replace(/\n/g, '<br/>');
}
