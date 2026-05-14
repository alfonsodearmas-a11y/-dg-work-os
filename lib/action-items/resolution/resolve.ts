import type { ExtractedItem } from '@/lib/action-items/extraction/types';
import type { UserStaffFields } from '@/lib/action-items/types';
import { resolveOwner } from './owner';
import { resolveDueDate } from './due';
import { assignPriority } from './priority';
import { validateExtractionItem } from '@/lib/action-items/validation/extraction';

export interface ReviewableItem {
  raw: ExtractedItem;
  owner_id: string | null;
  owner_method: 'meeting_scoped' | 'global' | 'role' | 'unresolved';
  due_at: Date | null;
  due_trigger: string | null;
  due_flagged: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  agency: string | null;          // owner.agency at resolve time; null if unresolved
  validation_ok: boolean;
  validation_issues: Array<{ code: string; field: string; message: string }>;
  confidence_overall: number;     // min of confidence_per_field
  confidence_reasons: string[];
}

export interface ResolveContext {
  meeting_date: Date;
  attendees: UserStaffFields[];
  allUsers: UserStaffFields[];
  transcript_text: string;
  speaker_role: 'officer' | 'minister' | 'ps' | 'parl_sec' | 'dg';
}

export function resolveExtractedItem(raw: ExtractedItem, ctx: ResolveContext): ReviewableItem {
  const own = resolveOwner({
    name_raw: raw.owner_name_raw,
    confidence: raw.confidence_per_field.owner,
    attendees: ctx.attendees,
    allUsers: ctx.allUsers,
  });
  const owner = ctx.allUsers.find(u => u.id === own.owner_id) ?? null;
  const due = resolveDueDate(raw.due_phrase, ctx.meeting_date);
  const validation = validateExtractionItem(raw, ctx.transcript_text);
  const conf = Math.min(
    raw.confidence_per_field.owner,
    raw.confidence_per_field.task,
    raw.confidence_per_field.due,
    raw.confidence_per_field.quote,
  );
  const priority = owner
    ? assignPriority(
        { task: raw.task, source_quote: raw.source_quote, due_at: due.due_at,
          speaker_role: ctx.speaker_role },
        owner, ctx.meeting_date)
    : 'low';
  return {
    raw,
    owner_id: own.owner_id,
    owner_method: own.method,
    due_at: due.due_at,
    due_trigger: due.due_trigger,
    due_flagged: due.flagged,
    priority,
    agency: owner?.agency ?? null,
    validation_ok: validation.ok,
    validation_issues: validation.ok ? [] : validation.issues.map(i => ({ code: i.code, field: i.field, message: i.message })),
    confidence_overall: conf,
    confidence_reasons: raw.confidence_reasons,
  };
}
