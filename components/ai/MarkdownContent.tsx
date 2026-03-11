'use client';

import { AGENCY_ROUTES } from './chat-types';

// ── Inline Markdown Renderer ──────────────────────────────────────────────────

export function renderInline(text: string, onAgencyClick?: (route: string) => void): React.ReactNode[] {
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
        <code key={key++} className="px-1.5 py-0.5 rounded bg-white/10 text-gold-500 text-[13px] font-mono">
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
            className="text-gold-500 hover:underline decoration-[#d4af37]/40 underline-offset-2 font-medium cursor-pointer"
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

// ── Markdown Table ────────────────────────────────────────────────────────────

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
              <th key={i} scope="col" className="px-3 py-2 text-left text-gold-500 font-semibold whitespace-nowrap">
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

// ── Block-level Markdown Content ──────────────────────────────────────────────

export function MarkdownContent({ text, onAgencyClick }: { text: string; onAgencyClick?: (route: string) => void }) {
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
      elements.push(<h4 key={key++} className="text-sm font-semibold text-gold-500 mt-3 mb-1">{renderInline(trimmed.slice(4), onAgencyClick)}</h4>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={key++} className="text-base font-semibold text-gold-500 mt-3 mb-1">{renderInline(trimmed.slice(3), onAgencyClick)}</h3>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<h2 key={key++} className="text-lg font-bold text-gold-500 mt-3 mb-1">{renderInline(trimmed.slice(2), onAgencyClick)}</h2>);
    } else {
      elements.push(<p key={key++} className="my-1 leading-relaxed">{renderInline(trimmed, onAgencyClick)}</p>);
    }
  }

  flushList();
  flushTable();
  return <div className="space-y-0.5">{elements}</div>;
}
