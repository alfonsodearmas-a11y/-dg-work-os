import { validateTaskDraft, type ValidationIssue } from '@/lib/action-items/validation';
import { quoteAppearsInTranscript } from './quote-substring';
import type { ExtractedItem } from '@/lib/action-items/extraction/types';

export interface ExtractionExtraIssue {
  code: 'quote_fabricated' | 'quote_missing' | 'timestamp_missing';
  field: 'source_quote' | 'source_timestamp';
  message: string;
}

export type ExtractionValidationResult =
  | { ok: true }
  | { ok: false; issues: Array<ValidationIssue | ExtractionExtraIssue> };

export function validateExtractionItem(
  item: ExtractedItem,
  transcript: string,
): ExtractionValidationResult {
  const base = validateTaskDraft({
    source: 'extraction',
    title: item.task,
    agency: '_unresolved_',
    owner_user_id: '_unresolved_',
    owner_name_raw: item.owner_name_raw,
    verb_category: item.verb_category,
  });
  const issues: Array<ValidationIssue | ExtractionExtraIssue> = [];
  if (!base.ok) issues.push(...base.issues);

  if (!item.source_quote || item.source_quote.trim().length === 0) {
    issues.push({ code: 'quote_missing', field: 'source_quote',
      message: 'source_quote is required for extraction items.' });
  } else if (!quoteAppearsInTranscript(item.source_quote, transcript)) {
    issues.push({ code: 'quote_fabricated', field: 'source_quote',
      message: 'source_quote does not appear in the transcript after normalization (likely fabricated).' });
  }
  if (!item.source_timestamp || item.source_timestamp.trim().length === 0) {
    issues.push({ code: 'timestamp_missing', field: 'source_timestamp',
      message: 'source_timestamp is required.' });
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
