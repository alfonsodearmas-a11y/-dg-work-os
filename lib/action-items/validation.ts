import {
  APPROVED_VERBS, BANNED_PHRASES,
  type VerbCategory,
} from './constants';

export interface TaskDraft {
  source: 'manual' | 'extraction';
  title: string;
  agency: string | null;
  owner_user_id: string | null;
  owner_name_raw: string | null;
  verb_category: VerbCategory | null;
}

export type ValidationIssueCode =
  | 'required'
  | 'title_too_long'
  | 'banned_phrase'
  | 'verb_taxonomy';

export interface ValidationIssue {
  code: ValidationIssueCode;
  field: 'title' | 'owner_user_id' | 'agency' | 'verb_category' | 'owner_name_raw';
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

// Whole-token banned verbs: rejected via word-boundary match so "handle valves"
// (noun) survives but "Handle the Berbice site" doesn't. Per Plan 1 decision #3.
const BANNED_TOKENS = ['handle', 'work on'];

export function validateTaskDraft(draft: TaskDraft): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!draft.title || draft.title.trim().length === 0) {
    issues.push({ code: 'required', field: 'title', message: 'Title is required.' });
  } else if (draft.title.length > 500) {
    issues.push({ code: 'title_too_long', field: 'title', message: 'Title must be ≤500 characters.' });
  }
  if (!draft.owner_user_id) {
    issues.push({ code: 'required', field: 'owner_user_id', message: 'Owner is required.' });
  }
  if (!draft.agency) {
    issues.push({ code: 'required', field: 'agency', message: 'Agency is required.' });
  }
  if (draft.source === 'extraction' && (!draft.owner_name_raw || draft.owner_name_raw.trim().length === 0)) {
    issues.push({ code: 'required', field: 'owner_name_raw', message: 'Owner name as spoken is required for extraction.' });
  }

  if (draft.title) {
    const lower = draft.title.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'banned_phrase', field: 'title',
          message: `Banned phrase "${phrase}" — rewrite with a specific deliverable.`,
        });
      }
    }
    for (const token of BANNED_TOKENS) {
      // Match only when the token appears as the sentence-initial verb (at the
      // very start of the title, optionally preceded by whitespace). This lets
      // "Investigate handle valves" pass while blocking "Handle the Berbice
      // site" and "Work on the procurement schedule".
      const re = new RegExp(`^\\s*${token.replace(/ /g, '\\s+')}\\b`, 'i');
      if (re.test(draft.title)) {
        issues.push({
          code: 'banned_phrase', field: 'title',
          message: `Banned verb "${token}" — rewrite with an approved verb and specific deliverable.`,
        });
      }
    }
  }

  if (draft.title && draft.verb_category) {
    const firstWord = draft.title.trim().split(/\s+/, 1)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    const allowed = APPROVED_VERBS[draft.verb_category];
    if (firstWord && allowed && !allowed.includes(firstWord)) {
      issues.push({
        code: 'verb_taxonomy', field: 'title',
        message: `First verb "${firstWord}" is not in category "${draft.verb_category}". Allowed: ${allowed.join(', ')}.`,
      });
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
