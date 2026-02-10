'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Sparkles, Send, Loader2 } from 'lucide-react';

interface Allocation {
  line_item: string;
  agency_code: string;
  budget_2026: number;
  budget_2026_fmt: string;
}

export function BudgetAIBrief({ allocation, onClose }: { allocation: Allocation; onClose: () => void }) {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const streamAnalysis = useCallback(async (question?: string) => {
    setIsStreaming(true);
    if (!question) setContent('');

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/budget/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_code: allocation.agency_code,
          line_item: allocation.line_item,
          budget_2026: allocation.budget_2026,
          question: question || '',
        }),
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();

      let accumulated = question ? content + '\n\n---\n\n**Follow-up:** ' + question + '\n\n' : '';

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
            if (data.done) {
              setIsStreaming(false);
            }
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
        setContent(prev => prev + `\n\n**Error:** ${e}`);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [allocation, content]);

  useEffect(() => {
    streamAnalysis();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocation]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  const handleFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUp.trim() || isStreaming) return;
    const q = followUp.trim();
    setFollowUp('');
    streamAnalysis(q);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full md:max-w-2xl md:max-h-[80vh] bg-gradient-to-b from-[#1a2744] to-[#0a1628] border border-[#2d3a52] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up md:animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2d3a52] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#d4af37]/20 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-[#d4af37]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-white font-semibold text-sm truncate">Defence Brief</h3>
              <p className="text-[#64748b] text-[10px] truncate">{allocation.line_item}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[#d4af37] font-mono text-sm font-bold">{allocation.budget_2026_fmt}</span>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#2d3a52] text-[#64748b] hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          {content ? (
            <div className="ai-brief-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
          ) : (
            <div className="flex items-center gap-3 text-[#64748b]">
              <Loader2 className="h-5 w-5 animate-spin text-[#d4af37]" />
              <span className="text-sm">Preparing defence brief...</span>
            </div>
          )}
          {isStreaming && content && (
            <span className="inline-block w-2 h-4 bg-[#d4af37] animate-pulse ml-0.5" />
          )}
        </div>

        {/* Follow-up Input */}
        <form onSubmit={handleFollowUp} className="p-3 border-t border-[#2d3a52] shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={followUp}
              onChange={e => setFollowUp(e.target.value)}
              placeholder="Ask a follow-up question..."
              className="input-premium flex-1 text-sm py-2"
              disabled={isStreaming}
            />
            <button
              type="submit"
              disabled={isStreaming || !followUp.trim()}
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

// Simple markdown → HTML for AI briefs
function renderMarkdown(text: string): string {
  const sections = text.split(/^## /m);
  let html = '';

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    if (i === 0 && !text.startsWith('## ')) {
      html += `<div class="ai-section ai-section-intro">${inlineMarkdown(section)}</div>`;
      continue;
    }

    const nlIndex = section.indexOf('\n');
    const title = nlIndex > -1 ? section.slice(0, nlIndex).trim() : section;
    const body = nlIndex > -1 ? section.slice(nlIndex + 1).trim() : '';

    const sectionType = classifySection(title);
    const icon = sectionIcons[sectionType] || '';

    html += `<div class="ai-section ai-section-${sectionType}">`;
    html += `<div class="ai-section-header"><span class="ai-section-icon">${icon}</span><h3>${title}</h3></div>`;
    if (body) html += `<div class="ai-section-body">${processBody(body)}</div>`;
    html += `</div>`;
  }

  return html;
}

function classifySection(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('executive') || t.includes('summary')) return 'executive';
  if (t.includes('number') || t.includes('trend') || t.includes('figure')) return 'numbers';
  if (t.includes('question') || t.includes('rebuttal') || t.includes('q&a') || t.includes('anticipated')) return 'qa';
  if (t.includes('justification') || t.includes('argument')) return 'justifications';
  if (t.includes('fund') || t.includes('covers') || t.includes('what this')) return 'funds';
  return 'default';
}

const sectionIcons: Record<string, string> = {
  executive: '⚡',
  numbers: '📊',
  qa: '❓',
  justifications: '✅',
  funds: '🎯',
  default: '📋',
};

function processBody(body: string): string {
  // Handle Q&A pairs
  if (body.includes('**Q:') || body.includes('**Q ')) {
    const parts = body.split(/(?=\*\*Q[:\s])/);
    let html = '';
    for (const part of parts) {
      if (part.trim().startsWith('**Q')) {
        const [q, ...rest] = part.split(/\*\*A[:\s]\*\*/);
        html += `<div class="ai-qa-pair">`;
        html += `<div class="ai-qa-q">${inlineMarkdown(q.replace(/^\*\*Q[:\s]\*\*\s*/, ''))}</div>`;
        if (rest.length > 0) html += `<div class="ai-qa-a">${inlineMarkdown(rest.join(''))}</div>`;
        html += `</div>`;
      } else {
        html += inlineMarkdown(part);
      }
    }
    return html;
  }

  // Handle tables
  if (body.includes('|') && body.includes('---')) {
    const lines = body.split('\n');
    let inTable = false;
    let tableHtml = '';
    let otherHtml = '';

    for (const line of lines) {
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        if (line.includes('---')) continue;
        if (!inTable) {
          tableHtml += '<table class="ai-table"><tbody>';
          inTable = true;
        }
        const cells = line.split('|').filter(c => c.trim());
        const tag = tableHtml.includes('<tr>') ? 'td' : 'th';
        tableHtml += '<tr>' + cells.map(c => `<${tag}>${inlineMarkdown(c.trim())}</${tag}>`).join('') + '</tr>';
      } else {
        if (inTable) {
          tableHtml += '</tbody></table>';
          inTable = false;
        }
        otherHtml += inlineMarkdown(line) + '\n';
      }
    }
    if (inTable) tableHtml += '</tbody></table>';
    return tableHtml + otherHtml;
  }

  return inlineMarkdown(body);
}

function inlineMarkdown(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Money amounts
    .replace(/G\$[\d,.]+[BMK]/g, '<span class="ai-money">$&</span>')
    // Page references
    .replace(/V\dp\d+/g, '<span class="ai-ref">$&</span>')
    // Bullet points
    .replace(/^[-•]\s+(.+)/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Line breaks
    .replace(/\n/g, '<br/>');
}
