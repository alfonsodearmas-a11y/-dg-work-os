// ── PSIP identity resolution & field diffing ──────────────────────────────────
//
// Given parsed incoming tenders and a snapshot of existing DB tenders, compute
// a match plan: NEW rows, UPDATE rows (with per-field diffs), and REVIEW rows
// for ambiguous fuzzy matches.
//
// Scoped matching (design doc §6.3): narrow to the same
// (agency, programme_code, sub_programme_code, programme_activity) before
// attempting fuzzy match. Line-item codes act as tiebreakers.
//
// Thresholds: 0.92 high-confidence auto-match, 0.80 review lower bound. Below
// 0.80 → NEW. Hardcoded here; tune after 2 real uploads (Q11).

import type {
  MatchResult,
  MatchStats,
  ParsedTender,
  ReviewReason,
} from './types';
import { normalizeDescription } from './parser';

export const MATCH_THRESHOLD_HIGH = 0.92;
export const MATCH_THRESHOLD_REVIEW = 0.8;

/** Fields whose incoming value overrides the DB value, producing a field_diff entry. */
export const DIFFABLE_FIELDS = [
  'description',
  'stage',
  'stage_source',
  'method',
  'is_rollover',
  'has_exception',
  'date_advertised',
  'date_closed',
  'date_eval_sent_mtb_rtb',
  'date_eval_sent_nptab',
  'date_of_award',
  'contractor',
  'implementation_start_date',
  'implementation_end_date',
  'implementation_status_pct',
  'remarks',
  'programme_activity',
  'line_item_code',
  'programme_code',
  'sub_programme_code',
] as const;

export type DiffableField = typeof DIFFABLE_FIELDS[number];

export interface ExistingTenderSnapshot {
  id: string;
  source: 'psip' | 'trello' | 'manual';
  description: string;
  agency: string;
  programme_code: string | null;
  sub_programme_code: string | null;
  programme_activity: string | null;
  line_item_code: string | null;
  stage: string;
  stage_source: string;
  method: string | null;
  is_rollover: boolean;
  has_exception: boolean;
  date_advertised: string | null;
  date_closed: string | null;
  date_eval_sent_mtb_rtb: string | null;
  date_eval_sent_nptab: string | null;
  date_of_award: string | null;
  contractor: string | null;
  implementation_start_date: string | null;
  implementation_end_date: string | null;
  implementation_status_pct: number | null;
  remarks: string | null;
  awarded_at: string | null;
  first_appearance_already_awarded: boolean;
}

// ── Similarity ────────────────────────────────────────────────────────────────

/** Levenshtein distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function levenshteinRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

function tokenSortRatio(a: string, b: string): number {
  const sa = a.split(' ').filter(Boolean).sort().join(' ');
  const sb = b.split(' ').filter(Boolean).sort().join(' ');
  return levenshteinRatio(sa, sb);
}

export function similarity(a: string, b: string): number {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (na === nb) return 1;
  return Math.max(levenshteinRatio(na, nb), tokenSortRatio(na, nb));
}

// ── Scope key ─────────────────────────────────────────────────────────────────

function scopeKey(t: {
  agency: string;
  programme_code: string | null;
  sub_programme_code: string | null;
  programme_activity: string | null;
}): string {
  return [
    t.agency || '',
    t.programme_code || '',
    t.sub_programme_code || '',
    normalizeDescription(t.programme_activity || ''),
  ].join('|');
}

// ── Field diff ────────────────────────────────────────────────────────────────

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

export function fieldDiffs(incoming: ParsedTender, existing: ExistingTenderSnapshot): Array<{ field: string; old: unknown; new: unknown }> {
  const diffs: Array<{ field: string; old: unknown; new: unknown }> = [];
  for (const f of DIFFABLE_FIELDS) {
    const nVal = incoming[f as keyof ParsedTender];
    const oVal = existing[f as keyof ExistingTenderSnapshot];
    if (!equal(oVal, nVal)) {
      diffs.push({ field: f, old: oVal, new: nVal });
    }
  }
  return diffs;
}

// ── Matcher ───────────────────────────────────────────────────────────────────

export interface MatchPlan {
  results: MatchResult[];
  stats: MatchStats;
  missing: ExistingTenderSnapshot[];
}

function pushReview(
  results: MatchResult[],
  stats: MatchStats,
  inc: ParsedTender,
  candidates: Array<{ tender_id: string; score: number; description: string }>,
  reason: ReviewReason,
) {
  results.push({ kind: 'review', incoming: inc, candidates, review_reason: reason });
  stats.review_queue++;
  if (reason === 'ambiguous_match') stats.review_queue_ambiguous_match++;
  else stats.review_queue_ambiguous_stage++;
}

export function matchTenders(
  incoming: ParsedTender[],
  existing: ExistingTenderSnapshot[],
): MatchPlan {
  // Index existing PSIP-sourced tenders by scope for quick lookup. Trello and
  // manual sources are NEVER matched against — they live outside the PSIP
  // upload flow.
  const byScope = new Map<string, ExistingTenderSnapshot[]>();
  for (const e of existing) {
    if (e.source !== 'psip') continue;
    const key = scopeKey(e);
    if (!byScope.has(key)) byScope.set(key, []);
    byScope.get(key)!.push(e);
  }

  const matchedIds = new Set<string>();
  const results: MatchResult[] = [];
  const stats: MatchStats = {
    new: 0,
    updated: 0,
    updated_field_changes: 0,
    review_queue: 0,
    review_queue_ambiguous_match: 0,
    review_queue_ambiguous_stage: 0,
    high_confidence_matches: 0,
    missing: 0,
  };

  for (const inc of incoming) {
    // Ambiguous-stage rows (col J blank + no dates) short-circuit to review.
    // They don't enter the match/update path because we have no reliable
    // stage to propagate. If the row later gets stage data in the
    // spreadsheet, the fuzzy matcher will find the existing review row's
    // eventual tender on the next upload.
    if (inc.needs_stage_review) {
      pushReview(results, stats, inc, [], 'ambiguous_stage');
      continue;
    }

    const key = scopeKey(inc);
    const scoped = byScope.get(key) ?? [];

    if (scoped.length === 0) {
      results.push({ kind: 'new', incoming: inc });
      stats.new++;
      continue;
    }

    // Exact normalized-description match.
    const incNorm = normalizeDescription(inc.description);
    const exact = scoped.find((c) => normalizeDescription(c.description) === incNorm);
    if (exact) {
      const diffs = fieldDiffs(inc, exact);
      results.push({
        kind: 'update',
        incoming: inc,
        existing_tender_id: exact.id,
        score: 1,
        field_diffs: diffs,
      });
      stats.updated++;
      stats.updated_field_changes += diffs.length;
      matchedIds.add(exact.id);
      continue;
    }

    // Fuzzy.
    const scored = scoped.map((c) => ({ snap: c, score: similarity(inc.description, c.description) }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];

    if (!top) {
      results.push({ kind: 'new', incoming: inc });
      stats.new++;
      continue;
    }

    if (top.score >= MATCH_THRESHOLD_HIGH) {
      // Tiebreaker: multiple candidates with equal top score.
      const tied = scored.filter((s) => Math.abs(s.score - top.score) < 1e-9);
      let chosen = top.snap;
      if (tied.length > 1) {
        // Prefer a candidate whose line_item_code matches the incoming row's.
        if (inc.line_item_code) {
          const exactCode = tied.find((s) => s.snap.line_item_code === inc.line_item_code);
          if (exactCode) chosen = exactCode.snap;
          else {
            pushReview(results, stats, inc, tied.map((s) => ({ tender_id: s.snap.id, score: s.score, description: s.snap.description })), 'ambiguous_match');
            continue;
          }
        } else {
          pushReview(results, stats, inc, tied.map((s) => ({ tender_id: s.snap.id, score: s.score, description: s.snap.description })), 'ambiguous_match');
          continue;
        }
      }
      const diffs = fieldDiffs(inc, chosen);
      results.push({
        kind: 'update',
        incoming: inc,
        existing_tender_id: chosen.id,
        score: top.score,
        field_diffs: diffs,
      });
      stats.updated++;
      stats.updated_field_changes += diffs.length;
      stats.high_confidence_matches++;
      matchedIds.add(chosen.id);
      continue;
    }

    if (top.score >= MATCH_THRESHOLD_REVIEW) {
      const topCandidates = scored.slice(0, 3).map((s) => ({ tender_id: s.snap.id, score: s.score, description: s.snap.description }));
      pushReview(results, stats, inc, topCandidates, 'ambiguous_match');
      continue;
    }

    results.push({ kind: 'new', incoming: inc });
    stats.new++;
  }

  // Missing: existing PSIP tenders not touched.
  const missing = existing.filter((e) => e.source === 'psip' && !matchedIds.has(e.id));
  stats.missing = missing.length;

  return { results, stats, missing };
}
