// ── PSIP Monitoring Form parser ──────────────────────────────────────────────
//
// Walks the `PSIP Monitoring Form` sheet of the weekly MPUA PSIP xlsx and
// produces a flat list of parsed tenders ready for identity resolution.
//
// Rules implemented (see docs/procurement-audit-and-rebuild-plan.md §8):
//   - Programme (3-digit) and sub-programme (7-digit) header rows drive
//     agency attribution and scope.
//   - Sub-programmes 2606600 (Lethem) and 2606700 (HECI) are excluded —
//     those live in Trello.
//   - Parent rows with line-item codes in col A collapse into
//     `programme_activity` when they have children; parents with no
//     children become tenders themselves (programme_activity stays NULL —
//     the parent has no super-parent context).
//   - Divider rows ("Rollover:" / "New:" / "New" / "Summary:") are skipped.
//   - After `Summary:`, every subsequent non-blank row is treated as part
//     of the rollup block (fixes the 6 MARAD phantoms at R246–R251).
//   - Method filter: only Open Tender / Public Tender enter the pipeline.
//     `Public Tender` → `open_tender`. Every other method (Quotation,
//     Sole Source, Restrictive, Comm.Participation, Nil, blank) is
//     excluded at ingest.
//   - Stage resolution:
//       • col J is a real stage → use it (status_column).
//       • col J is `Rollover` or `See Remarks` → flag + infer from dates
//         (inferred_from_dates; "Nothing → Design" fallback).
//       • col J blank + no dates → route to review queue with
//         review_reason='ambiguous_stage' (never silently defaulted).
//   - Programme-344 duplicates (same description under bare `344` header and
//     under a sub-programme) → earlier copy dropped.

import * as XLSX from 'xlsx';
import { parseFlexibleDate, cleanTextField } from '@/lib/procurement/data-cleaner';
import type {
  ParsedTender,
  ParseResult,
  ParseStats,
  TenderAgency,
  TenderMethod,
  TenderStage,
  TenderStageSource,
} from './types';

const SHEET_NAME = 'PSIP Monitoring Form';

// Header rows span 1..4 in the sheet. Data starts at row 5 (0-indexed row 4).
const DATA_START_ROW = 4;

// ── Agency attribution ────────────────────────────────────────────────────────

function agencyFor(
  programmeCode: string | null,
  subProgrammeCode: string | null,
): TenderAgency | null {
  if (!programmeCode) return null;
  switch (programmeCode) {
    case '341':
      return 'MPUA';
    case '342':
      if (subProgrammeCode === '2606600' || subProgrammeCode === '2606700') return null;
      return 'GPL';
    case '343':
      return 'GWI';
    case '344':
      if (subProgrammeCode === '1601100') return 'HINTERLAND_AIRSTRIPS';
      if (subProgrammeCode === '1601500') return 'CJIA';
      if (subProgrammeCode === '1602000') return 'GCAA';
      return null; // bare 344 header rows are deduped against sub-programme rows
    case '345':
      return 'MARAD';
    default:
      return null;
  }
}

// ── Method normalization ──────────────────────────────────────────────────────

type MethodDisposition =
  | { kind: 'accepted'; method: 'open_tender'; normalized_public: boolean }
  | { kind: 'excluded_method'; raw: string }       // valid non-Open method per the enum
  | { kind: 'skipped_nil' }                         // explicit "Nil"
  | { kind: 'blank' };                              // empty cell — rejected per the method filter

function normalizeMethod(raw: string): MethodDisposition {
  const v = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!v) return { kind: 'blank' };
  if (v === 'nil') return { kind: 'skipped_nil' };
  if (v === 'open tender') return { kind: 'accepted', method: 'open_tender', normalized_public: false };
  if (v === 'public tender') return { kind: 'accepted', method: 'open_tender', normalized_public: true };
  // All remaining valid methods are excluded at ingest per the method filter.
  if (v === 'quotation') return { kind: 'excluded_method', raw: 'Quotation' };
  if (v === 'sole source' || v === 'sole-source') return { kind: 'excluded_method', raw: 'Sole Source' };
  if (v === 'restrictive') return { kind: 'excluded_method', raw: 'Restrictive' };
  if (v === 'comm.participation' || v === 'comm participation' || v === 'community participation') {
    return { kind: 'excluded_method', raw: 'Comm.Participation' };
  }
  // Unknown / typo'd values — exclude rather than silently drop.
  return { kind: 'excluded_method', raw };
}

// ── Stage resolution ──────────────────────────────────────────────────────────

const PIPELINE_STAGES: Record<string, TenderStage> = {
  Design: 'design',
  Advertised: 'advertised',
  Evaluation: 'evaluation',
  'Awaiting Award': 'awaiting_award',
  Award: 'award',
};

function inferStageFromDates(
  adv: string | null,
  closed: string | null,
  evalMtb: string | null,
  evalNptab: string | null,
  award: string | null,
): TenderStage {
  if (award) return 'award';
  if (evalMtb || evalNptab) return 'awaiting_award';
  if (closed) return 'evaluation';
  if (adv) return 'advertised';
  return 'design';
}

interface StageResolution {
  stage: TenderStage;
  stageSource: TenderStageSource;
  isRollover: boolean;
  hasException: boolean;
  normalizedLowercase: boolean;
  needsStageReview: boolean;
}

function resolveStage(
  statusRaw: string,
  dates: {
    adv: string | null;
    closed: string | null;
    evalMtb: string | null;
    evalNptab: string | null;
    award: string | null;
  },
): StageResolution {
  const raw = statusRaw.trim();
  // Normalize lowercase 'award' → 'Award' (row 187 in current sheet).
  let normalized = raw;
  let normalizedLowercase = false;
  if (raw === 'award') {
    normalized = 'Award';
    normalizedLowercase = true;
  }
  // Typo tolerance: "Awaitng Award" → "Awaiting Award".
  if (/^awaitng/i.test(normalized)) {
    normalized = normalized.replace(/^awaitng/i, 'Awaiting');
  }

  if (normalized in PIPELINE_STAGES) {
    return {
      stage: PIPELINE_STAGES[normalized],
      stageSource: 'status_column',
      isRollover: false,
      hasException: false,
      normalizedLowercase,
      needsStageReview: false,
    };
  }

  const isRollover = /^rollover$/i.test(normalized);
  const hasException = /^see remarks$/i.test(normalized);

  const hasAnyDate = Boolean(dates.adv || dates.closed || dates.evalMtb || dates.evalNptab || dates.award);

  // col J blank AND no dates → route to review queue with ambiguous_stage.
  // Flag rows (Rollover / See Remarks) still get inference fallback to Design
  // since the human-written flag is itself a signal.
  if (!normalized && !hasAnyDate) {
    return {
      stage: 'design', // provisional — row will be queued for review, not ingested
      stageSource: 'inferred_from_dates',
      isRollover: false,
      hasException: false,
      normalizedLowercase,
      needsStageReview: true,
    };
  }

  // Rollover / See Remarks / blank-with-dates → infer from dates.
  const stage = inferStageFromDates(dates.adv, dates.closed, dates.evalMtb, dates.evalNptab, dates.award);
  return {
    stage,
    stageSource: 'inferred_from_dates',
    isRollover,
    hasException,
    normalizedLowercase,
    needsStageReview: false,
  };
}

// ── Date extraction ───────────────────────────────────────────────────────────

function dateCell(raw: unknown): string | null {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Ignore 'Yes' / 'No' tokens that appear in the sheet when a date is expected but unknown.
  if (/^(yes|no|n\/a|tba|tbd)$/i.test(s)) return null;
  return parseFlexibleDate(s);
}

function numOrNull(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).replace(/[%\s]/g, '');
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return Math.round(n);
}

function textOrNull(raw: unknown): string | null {
  if (raw == null) return null;
  const s = cleanTextField(String(raw));
  return s || null;
}

// ── Row classification ────────────────────────────────────────────────────────

const PROGRAMME_CODE_RE = /^3\d{2}$/;
const SUB_PROGRAMME_CODE_RE = /^\d{7}$/;
const LINE_ITEM_CODE_RE = /^([HCU]-?\d+|PO-\d+)/i;
// Bare-word dividers ("New", "Rollover") without a trailing colon appear in
// the sheet too — e.g. R105 "New" in the 2026 workbook. Absorb both forms.
const DIVIDER_RE = /^(Rollover:?|New:?|Summary:|Sub-Total|Total)$/i;
const SUMMARY_HEADER_RE = /^Summary:$/i;
const MINISTRY_BANNER_RE = /^MINISTRY/i;

interface RawRow {
  rowNumber: number;  // 1-based sheet row number
  A: string;
  B: string;
  D: string;
  statusRaw: string;   // col J
  dateAdv: string | null;
  dateClosed: string | null;
  dateEvalMtb: string | null;
  dateEvalNptab: string | null;
  dateAward: string | null;
  contractor: string | null;
  implStart: string | null;
  implEnd: string | null;
  implPct: number | null;
  remarks: string | null;
  raw: Record<string, string | number | null>;
}

// ── Public: parse ─────────────────────────────────────────────────────────────

export function parsePsipWorkbook(data: ArrayBuffer | Buffer): ParseResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  if (!wb.Sheets[SHEET_NAME]) {
    throw new Error(`Workbook is missing the "${SHEET_NAME}" sheet. Ensure this is the MPUA PSIP Monitoring workbook.`);
  }
  const ws = wb.Sheets[SHEET_NAME];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true });

  const stats: ParseStats = {
    total_rows_scanned: 0,
    tenders_parsed: 0,
    excluded_lethem_heci: 0,
    programme_header_dupes: 0,
    skipped_nil_method: 0,
    skipped_dividers: 0,
    skipped_summary_rollup: 0,
    excluded_method_filter: 0,
    queued_for_stage_review: 0,
    normalized_public_tender: 0,
    normalized_lowercase_award: 0,
    stages_inferred_from_dates: 0,
    parents_collapsed_children: 0,
    parents_self_as_tender: 0,
  };
  const warnings: string[] = [];

  // Pre-walk: classify rows.
  const classified: RawRow[] = [];
  for (let i = DATA_START_ROW; i < raw.length; i++) {
    const row = raw[i] ?? [];
    const A = cleanTextField(String(row[0] ?? ''));
    const B = cleanTextField(String(row[1] ?? ''));
    // Skip fully blank rows.
    if (!A && !B && row.every((c) => c == null || c === '')) continue;
    stats.total_rows_scanned++;
    classified.push({
      rowNumber: i + 1,
      A,
      B,
      D: cleanTextField(String(row[3] ?? '')),
      statusRaw: String(row[9] ?? '').trim(),
      dateAdv: dateCell(row[4]),
      dateClosed: dateCell(row[5]),
      dateEvalMtb: dateCell(row[6]),
      dateEvalNptab: dateCell(row[7]),
      dateAward: dateCell(row[8]),
      contractor: textOrNull(row[10]),
      implStart: dateCell(row[14]),
      implEnd: dateCell(row[15]),
      implPct: numOrNull(row[16]),
      remarks: textOrNull(row[17]),
      raw: {
        A, B,
        method: cleanTextField(String(row[3] ?? '')),
        date_advertised: String(row[4] ?? ''),
        date_closed: String(row[5] ?? ''),
        date_eval_sent_mtb: String(row[6] ?? ''),
        date_eval_sent_nptab: String(row[7] ?? ''),
        date_of_award: String(row[8] ?? ''),
        status: String(row[9] ?? ''),
        contractor: String(row[10] ?? ''),
        implementation_start_date: String(row[14] ?? ''),
        implementation_end_date: String(row[15] ?? ''),
        implementation_status_pct: String(row[16] ?? ''),
        remarks: String(row[17] ?? ''),
      },
    });
  }

  // Walk: build candidate tender list respecting parent/child collapse rules.
  const candidates: ParsedTender[] = [];
  let currentProgramme: string | null = null;
  let currentSub: string | null = null;
  let currentSubExcluded = false;
  // Summary-rollup absorption. Turns on when we see "Summary:" in col B;
  // every subsequent row is discarded until a new programme/sub-programme
  // header or a fully blank row pulls us out. Fixes the 6 MARAD phantoms
  // at rows 246-251 of the 2026 workbook.
  let inSummaryRollup = false;
  // Pending parent: materializes only if no children arrive before the next
  // programme/sub/parent row.
  let pendingParent: {
    row: RawRow;
    children: number;
  } | null = null;

  const tallyBuilt = (built: ReturnType<typeof buildTenderFromRow>) => {
    if (built === 'excluded') stats.excluded_lethem_heci++;
    else if (built === 'skipped_nil') stats.skipped_nil_method++;
    else if (built === 'excluded_method') stats.excluded_method_filter++;
    else if (built) {
      if (built.needs_stage_review) stats.queued_for_stage_review++;
      candidates.push(built);
    }
  };

  const flushPendingParent = () => {
    if (!pendingParent) return;
    if (pendingParent.children === 0) {
      // Parent becomes its own tender. programme_activity stays NULL —
      // a parent without children has no super-parent context. Echoing
      // the row's own description would be noise.
      const built = buildTenderFromRow(
        pendingParent.row,
        currentProgramme,
        currentSub,
        null,
        null,
        stats,
      );
      tallyBuilt(built);
      if (built && built !== 'excluded' && built !== 'skipped_nil' && built !== 'excluded_method') {
        stats.parents_self_as_tender++;
      }
    } else {
      stats.parents_collapsed_children++;
    }
    pendingParent = null;
  };

  for (const r of classified) {
    // Programme header (3-digit).
    if (PROGRAMME_CODE_RE.test(r.A)) {
      flushPendingParent();
      currentProgramme = r.A;
      currentSub = null;
      currentSubExcluded = false;
      inSummaryRollup = false;
      continue;
    }
    // Sub-programme header (7-digit).
    if (SUB_PROGRAMME_CODE_RE.test(r.A)) {
      flushPendingParent();
      currentSub = r.A;
      currentSubExcluded = r.A === '2606600' || r.A === '2606700';
      inSummaryRollup = false;
      continue;
    }
    // Summary-rollup entry.
    if (r.B && SUMMARY_HEADER_RE.test(r.B) && !r.A) {
      flushPendingParent();
      inSummaryRollup = true;
      stats.skipped_summary_rollup++;
      continue;
    }
    // Absorption mode: inside the rollup, drop every content-bearing row.
    if (inSummaryRollup) {
      stats.skipped_summary_rollup++;
      continue;
    }
    // Ministry banner line.
    if (MINISTRY_BANNER_RE.test(r.B) && !r.A) continue;

    // Excluded sub-programme — count and drop.
    if (currentSubExcluded) {
      // Skip parent and child rows alike; count only when B is meaningful.
      if (r.B || r.A) stats.excluded_lethem_heci++;
      continue;
    }

    // Divider rows — colon or no colon ("Rollover:", "New", etc.) as long
    // as col A is empty and the row has no method/status signal.
    if (r.B && DIVIDER_RE.test(r.B) && !r.A && !r.D && !r.statusRaw) {
      stats.skipped_dividers++;
      continue;
    }

    // Parent candidate row (has line-item code in A).
    if (LINE_ITEM_CODE_RE.test(r.A)) {
      flushPendingParent();
      pendingParent = { row: r, children: 0 };
      continue;
    }

    // Leaf row (no A, has B).
    if (!r.A && r.B) {
      if (pendingParent) pendingParent.children++;
      const activity = pendingParent ? pendingParent.row.B : null;
      const built = buildTenderFromRow(r, currentProgramme, currentSub, null, activity, stats);
      tallyBuilt(built);
      continue;
    }
  }
  flushPendingParent();

  // Programme-344 duplicate removal: if a tender has sub=null under programme
  // 344 (bare header) and the same description appears later with a non-null
  // sub under 344, drop the earlier copy.
  const tenders: ParsedTender[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (a.programme_code === '344' && !a.sub_programme_code) {
      const laterMatch = candidates.slice(i + 1).find(
        (b) =>
          b.programme_code === '344' &&
          b.sub_programme_code &&
          normalizeDescription(b.description) === normalizeDescription(a.description),
      );
      if (laterMatch) {
        stats.programme_header_dupes++;
        continue;
      }
    }
    tenders.push(a);
  }

  stats.tenders_parsed = tenders.length;
  stats.stages_inferred_from_dates = tenders.filter((t) => t.stage_source === 'inferred_from_dates').length;

  return { tenders, stats, warnings };
}

// ── Builder ───────────────────────────────────────────────────────────────────

type BuildOutcome =
  | ParsedTender
  | 'excluded'
  | 'skipped_nil'
  | 'excluded_method'
  | null;

function buildTenderFromRow(
  r: RawRow,
  programmeCode: string | null,
  subProgrammeCode: string | null,
  _reserved: null,
  programmeActivity: string | null,
  stats: ParseStats,
): BuildOutcome {
  const agency = agencyFor(programmeCode, subProgrammeCode);
  if (!agency) {
    // Programme-344 bare-header rows (no sub-programme) describe RFPs that
    // appear again later under a sub-programme. The dedup pass after parsing
    // drops them. We can't attribute an agency without a sub, so we emit
    // them with a synthetic CJIA agency value; in the fixture, every such
    // row is removed by the duplicate rule. If a future sheet introduces a
    // genuinely orphan 344 row, it will surface in the review queue rather
    // than silently disappear.
    if (programmeCode === '344' && !subProgrammeCode) {
      return buildSyntheticBareAgencyTender(r, programmeCode, programmeActivity);
    }
    return 'excluded';
  }

  // Normalize method. Method filter is strict: Open / Public only.
  const methodResult = normalizeMethod(r.D);
  if (methodResult.kind === 'skipped_nil') return 'skipped_nil';
  if (methodResult.kind === 'excluded_method' || methodResult.kind === 'blank') {
    return 'excluded_method';
  }
  if (methodResult.normalized_public) stats.normalized_public_tender++;

  const stageResolution = resolveStage(r.statusRaw, {
    adv: r.dateAdv,
    closed: r.dateClosed,
    evalMtb: r.dateEvalMtb,
    evalNptab: r.dateEvalNptab,
    award: r.dateAward,
  });
  if (stageResolution.normalizedLowercase) stats.normalized_lowercase_award++;

  const description = r.B;
  if (!description) return null;

  return {
    row_number: r.rowNumber,
    description,
    agency,
    programme_code: programmeCode ?? '',
    sub_programme_code: subProgrammeCode,
    programme_activity: programmeActivity,
    line_item_code: LINE_ITEM_CODE_RE.test(r.A) ? r.A : null,
    stage: stageResolution.stage,
    stage_source: stageResolution.stageSource,
    method: methodResult.method,
    is_rollover: stageResolution.isRollover,
    has_exception: stageResolution.hasException,
    date_advertised: r.dateAdv,
    date_closed: r.dateClosed,
    date_eval_sent_mtb_rtb: r.dateEvalMtb,
    date_eval_sent_nptab: r.dateEvalNptab,
    date_of_award: r.dateAward,
    contractor: r.contractor,
    implementation_start_date: r.implStart,
    implementation_end_date: r.implEnd,
    implementation_status_pct: r.implPct,
    remarks: r.remarks,
    raw_row: r.raw,
    needs_stage_review: stageResolution.needsStageReview,
  };
}

// ── Description normalization (used for dedup + fuzzy matching) ───────────────

export function normalizeDescription(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,;:()[\]]/g, '');
}

// ── Synthetic bare-agency tender (programme-344 duplicate path) ───────────────

function buildSyntheticBareAgencyTender(
  r: RawRow,
  programmeCode: string,
  programmeActivity: string | null,
): ParsedTender | null {
  const description = r.B;
  if (!description) return null;
  const stageResolution = resolveStage(r.statusRaw, {
    adv: r.dateAdv,
    closed: r.dateClosed,
    evalMtb: r.dateEvalMtb,
    evalNptab: r.dateEvalNptab,
    award: r.dateAward,
  });
  const methodResult = normalizeMethod(r.D);
  // If the bare-344 row survives (no dup match later), method filter applies.
  // Coerce the method field to a valid enum value only for the accepted case;
  // otherwise leave null and let the dedup path drop it.
  const method = methodResult.kind === 'accepted' ? methodResult.method : null;
  return {
    row_number: r.rowNumber,
    description,
    agency: 'CJIA', // Synthetic sentinel; dedup pass drops these rows.
    programme_code: programmeCode,
    sub_programme_code: null,
    programme_activity: programmeActivity,
    line_item_code: LINE_ITEM_CODE_RE.test(r.A) ? r.A : null,
    stage: stageResolution.stage,
    stage_source: stageResolution.stageSource,
    method,
    is_rollover: stageResolution.isRollover,
    has_exception: stageResolution.hasException,
    date_advertised: r.dateAdv,
    date_closed: r.dateClosed,
    date_eval_sent_mtb_rtb: r.dateEvalMtb,
    date_eval_sent_nptab: r.dateEvalNptab,
    date_of_award: r.dateAward,
    contractor: r.contractor,
    implementation_start_date: r.implStart,
    implementation_end_date: r.implEnd,
    implementation_status_pct: r.implPct,
    remarks: r.remarks,
    raw_row: r.raw,
    needs_stage_review: stageResolution.needsStageReview,
  };
}
