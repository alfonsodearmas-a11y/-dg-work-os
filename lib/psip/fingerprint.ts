// ── Parsed-row fingerprint ───────────────────────────────────────────────────
//
// Stable, human-readable identity for a parsed PSIP row, used to deduplicate
// across uploads and to look up persisted Skip/Match decisions.
//
// Format: agency|programme_code|sub_programme_code|norm(programme_activity)|norm(description)
//
// Normalization mirrors lib/psip/parser.ts:normalizeDescription so the SQL
// backfill in 098_review_fingerprint_and_decisions.sql produces identical
// strings to the runtime.
//
// We deliberately use the concatenated string itself rather than a hash:
// (1) no security need; (2) instantly inspectable in the DB; (3) trivial to
// debug ("show me everything for fingerprint X" is a substring search away).

import { supabaseAdmin } from '@/lib/db-admin';
import { normalizeDescription } from './parser';
import { fieldDiffs, type ExistingTenderSnapshot } from './matcher';
import type { MatchResult, ParsedTender } from './types';

export function computeRowFingerprint(row: ParsedTender): string {
  return [
    row.agency ?? '',
    row.programme_code ?? '',
    row.sub_programme_code ?? '',
    normalizeDescription(row.programme_activity ?? ''),
    normalizeDescription(row.description ?? ''),
  ].join('|');
}

// ── Lookups against the persisted decision tables ────────────────────────────

export async function loadActiveExcludedFingerprints(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('procurement_excluded_fingerprint')
    .select('fingerprint, expires_at');
  if (error) throw error;
  const now = Date.now();
  const out = new Set<string>();
  for (const row of data || []) {
    const expiresAt = row.expires_at as string | null;
    if (!expiresAt || new Date(expiresAt).getTime() > now) {
      out.add(row.fingerprint as string);
    }
  }
  return out;
}

export interface PriorMatchDecision {
  fingerprint: string;
  resolution_tender_id: string;
  reason_code: 'supersedes' | 'duplicates';
  decided_at: string;
}

// Latest decision per fingerprint wins.
export async function loadLatestMatchDecisionsByFingerprint(): Promise<Map<string, PriorMatchDecision>> {
  const { data, error } = await supabaseAdmin
    .from('procurement_match_decision')
    .select('fingerprint, resolution_tender_id, reason_code, decided_at')
    .order('decided_at', { ascending: false });
  if (error) throw error;
  const out = new Map<string, PriorMatchDecision>();
  for (const row of data || []) {
    const fp = row.fingerprint as string;
    if (out.has(fp)) continue; // already have the latest (we ordered DESC)
    out.set(fp, {
      fingerprint: fp,
      resolution_tender_id: row.resolution_tender_id as string,
      reason_code: row.reason_code as 'supersedes' | 'duplicates',
      decided_at: row.decided_at as string,
    });
  }
  return out;
}

// Find an existing review row for a fingerprint that should be reused
// (pending OR skipped — skipped here is necessarily 'defer' because permanent
// skips would have been filtered by the exclusion table earlier in the pipeline).
export interface ExistingReviewRow {
  id: string;
  status: 'pending' | 'skipped';
  seen_in_uploads: string[];
}

export async function findExistingReviewByFingerprint(
  fingerprint: string,
): Promise<ExistingReviewRow | null> {
  const { data, error } = await supabaseAdmin
    .from('tender_match_review')
    .select('id, status, seen_in_uploads')
    .eq('parsed_row_fingerprint', fingerprint)
    .in('status', ['pending', 'skipped'])
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  const row = (data || [])[0];
  if (!row) return null;
  return {
    id: row.id as string,
    status: row.status as 'pending' | 'skipped',
    seen_in_uploads: (row.seen_in_uploads as string[]) ?? [],
  };
}

// ── Preprocess: route incoming rows by persisted decisions ──────────────────
//
// Before matchTenders runs, parsed rows are routed through:
//   1. procurement_excluded_fingerprint — silently dropped (header rows,
//      not-a-tender rows, agency errors).
//   2. procurement_match_decision (latest per fingerprint):
//      - 'supersedes' — synthesized as a MatchResult{kind:'update'} so the
//        existing tender absorbs this row's diffs without bothering the user.
//      - 'duplicates' — silently dropped (the existing tender is already
//        canonical; this row is a redundant copy).
//   3. Otherwise — passed through to the regular matcher.
//
// Returned `injectedResults` are appended to plan.results AFTER matchTenders.
// Returned `supersededTenderIds` should be subtracted from plan.missing so a
// supersedes target is not double-flagged as missing on the same upload.

export interface PreprocessOutcome {
  remaining: ParsedTender[];
  injectedResults: MatchResult[];
  supersededTenderIds: Set<string>;
  excluded_count: number;
  prior_supersedes_count: number;
  prior_duplicates_count: number;
}

export async function preprocessIncomingRows(
  parsed: ParsedTender[],
  existing: ExistingTenderSnapshot[],
): Promise<PreprocessOutcome> {
  const [excludedFps, priorMatches] = await Promise.all([
    loadActiveExcludedFingerprints(),
    loadLatestMatchDecisionsByFingerprint(),
  ]);
  const existingById = new Map(existing.map((e) => [e.id, e]));

  const remaining: ParsedTender[] = [];
  const injectedResults: MatchResult[] = [];
  const supersededTenderIds = new Set<string>();
  let excluded_count = 0;
  let prior_supersedes_count = 0;
  let prior_duplicates_count = 0;

  for (const row of parsed) {
    const fp = computeRowFingerprint(row);

    if (excludedFps.has(fp)) {
      excluded_count++;
      continue;
    }

    const prior = priorMatches.get(fp);
    if (prior) {
      const existingRow = existingById.get(prior.resolution_tender_id);
      if (!existingRow) {
        // Prior decision target is gone (archived/deleted). Fall through
        // to normal matching rather than silently failing the decision.
        remaining.push(row);
        continue;
      }
      if (prior.reason_code === 'supersedes') {
        injectedResults.push({
          kind: 'update',
          incoming: row,
          existing_tender_id: prior.resolution_tender_id,
          field_diffs: fieldDiffs(row, existingRow),
          score: 1,
        });
        supersededTenderIds.add(prior.resolution_tender_id);
        prior_supersedes_count++;
      } else {
        // 'duplicates' — drop entirely.
        prior_duplicates_count++;
      }
      continue;
    }

    remaining.push(row);
  }

  return {
    remaining,
    injectedResults,
    supersededTenderIds,
    excluded_count,
    prior_supersedes_count,
    prior_duplicates_count,
  };
}
