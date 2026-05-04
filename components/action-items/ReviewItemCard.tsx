'use client';
import { useState } from 'react';
import type { ReviewableItem } from '@/lib/action-items/resolution/resolve';
import { VERB_CATEGORIES, type VerbCategory } from '@/lib/action-items/constants';
import { SupersessionSuggestion } from './SupersessionSuggestion';

export interface ReviewDecision {
  index: number;             // index within action_item_extractions.raw_response.items
  action: 'accept' | 'reject';
  edits: {
    task?: string;
    verb_category?: VerbCategory;
    owner_user_id?: string;
    due_at?: string | null;
    due_trigger?: string | null;
  };
  was_edited: boolean;
}

interface UserOption { id: string; name: string; agency: string | null; }

export function ReviewItemCard({
  index, item, ownerOptions, defaultAction, decision, onChange,
}: {
  index: number;
  item: ReviewableItem;
  ownerOptions: UserOption[];
  defaultAction: 'accept' | 'reject';
  decision: ReviewDecision | null;
  onChange: (d: ReviewDecision) => void;
}) {
  const cur: ReviewDecision = decision ?? { index, action: defaultAction, edits: {}, was_edited: false };
  const [task, setTask] = useState<string>(cur.edits.task ?? item.raw.task);
  const [verb, setVerb] = useState<VerbCategory>(cur.edits.verb_category ?? item.raw.verb_category);
  const [ownerId, setOwnerId] = useState<string>(cur.edits.owner_user_id ?? item.owner_id ?? '');
  const [dueAt, setDueAt] = useState<string>(cur.edits.due_at ?? (item.due_at?.toISOString().slice(0, 10) ?? ''));

  function set<K extends keyof ReviewDecision['edits']>(k: K, v: ReviewDecision['edits'][K], orig: unknown) {
    const edits = { ...cur.edits, [k]: v };
    onChange({ ...cur, edits, was_edited: cur.was_edited || v !== orig });
  }

  const issues = item.validation_issues;

  return (
    <div className={`bg-navy-900 border border-navy-800 rounded-lg p-3 ${cur.action === 'reject' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={cur.action === 'accept'}
          onChange={e => onChange({ ...cur, action: e.target.checked ? 'accept' : 'reject' })} />
        <div className="flex-1 space-y-2">
          <textarea value={task}
            onChange={e => { setTask(e.target.value); set('task', e.target.value, item.raw.task); }}
            rows={2} className="w-full bg-navy-950 border border-navy-800 rounded p-1 text-sm" />
          <div className="flex gap-2 text-xs flex-wrap">
            <select value={verb}
              onChange={e => { const v = e.target.value as VerbCategory; setVerb(v); set('verb_category', v, item.raw.verb_category); }}
              className="bg-navy-950 border border-navy-800 rounded px-1 py-0.5">
              {VERB_CATEGORIES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={ownerId}
              onChange={e => { setOwnerId(e.target.value); set('owner_user_id', e.target.value, item.owner_id); }}
              className="bg-navy-950 border border-navy-800 rounded px-1 py-0.5">
              <option value="">(unresolved)</option>
              {ownerOptions.map(o => <option key={o.id} value={o.id}>{o.name}{o.agency ? ` · ${o.agency}` : ''}</option>)}
            </select>
            <input type="date" value={dueAt}
              onChange={e => {
                setDueAt(e.target.value);
                set('due_at', e.target.value || null, item.due_at?.toISOString().slice(0, 10) ?? null);
              }}
              className="bg-navy-950 border border-navy-800 rounded px-1 py-0.5" />
            <span className="text-navy-600">conf {(item.confidence_overall * 100).toFixed(0)}%</span>
          </div>
          <blockquote className="text-xs italic text-navy-300 border-l-2 border-gold-500 pl-2">
            &ldquo;{item.raw.source_quote}&rdquo; <span className="text-navy-600">@ {item.raw.source_timestamp}</span>
          </blockquote>
          {issues.length > 0 && (
            <ul className="text-xs text-red-500 list-disc pl-4">
              {issues.map((iss, k) => <li key={k}>{iss.message}</li>)}
            </ul>
          )}
          <SupersessionSuggestion candidates={[]} />
        </div>
      </div>
    </div>
  );
}
