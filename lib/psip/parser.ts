// ── PSIP Monitoring Form parser ──────────────────────────────────────────────
//
// Walks the `PSIP Monitoring Form` sheet of the weekly MPUA PSIP xlsx and
// produces a flat list of parsed tenders ready for identity resolution.
//
// Rules implemented (design doc §4, §6.1, §6.2):
//   - Programme (3-digit) and sub-programme (7-digit) header rows drive
//     agency attribution and scope.
//   - Sub-programmes 2606600 (Lethem) and 2606700 (HECI) are excluded —
//     those live in Trello.
//   - Parent rows with line-item codes in col A collapse into
//     `programme_activity` when they have children; parents with no
//     children become tenders themselves.
//   - Divider rows (B starts with "Rollover:" / "New:" / "Summary:") are
//     skipped.
//   - `Public Tender` → `open_tender` (Q3); `Nil` method rows skipped (Q2).
//   - Status col: lowercase `award` → `Award`; `Rollover` → is_rollover flag;
//     `See Remarks` → has_exception flag; blank/flag cases infer stage from
//     date columns.
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

function normalizeMethod(raw: string): { method: TenderMethod | null; skip: boolean; normalized_public: boolean } {
  const v = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!v) return { method: null, skip: false, normalized_public: false };
  if (v === 'nil') return { method: null, skip: true, normalized_public: false };
  if (v === 'open tender') return { method: 'open_tender', skip: false, normalized_public: false };
  if (v === 'public tender') return { method: 'open_tender', skip: false, normalized_public: true };
  if (v === 'quotation') return { method: 'quotation', skip: false, normalized_public: false };
  if (v === 'sole source' || v === 'sole-source') return { method: 'sole_source', skip: false, normalized_public: false };
  if (v === 'restrictive') return { method: 'restrictive', skip: false, normalized_public: false };
  if (v === 'comm.participation' || v === 'comm participation' || v === 'community participation') {
    return { method: 'comm_participation', skip: false, normalized_public: false };
  }
  return { method: null, skip: false, normalized_public: false };
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

function resolveStage(
  statusRaw: string,
  dates: {
    adv: string | null;
    closed: string | null;
    evalMtb: string | null;
    evalNptab: string | null;
    award: string | null;
  },
): { stage: TenderStage; stageSource: TenderStageSource; isRollover: boolean; hasException: boolean; normalizedLowercase: boolean } {
  const raw = statusRaw.trim();
  // Normalize lowercase 'award' → 'Award' (row 187 in current sheet).
  let normalized = raw;
  let normalizedLowercase = false;
  if (raw === 'award') {
    normalized = 'Award';
    normalizedLowercase = true;
  }

  if (normalized in PIPELINE_STAGES) {
    return {
      stage: PIPELINE_STAGES[normalized],
      stageSource: 'status_column',
      isRollover: false,
      hasException: false,
      normalizedLowercase,
    };
  }

  // Rollover / See Remarks / blank → infer.
  const stage = inferStageFromDates(dates.adv, dates.closed, dates.evalMtb, dates.evalNptab, dates.award);
  return {
    stage,
    stageSource: 'inferred_from_dates',
    isRollover: normalized === 'Rollover',
    hasException: normalized === 'See Remarks',
    normalizedLowercase,
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
const DIVIDER_RE = /^(Rollover:|New:|Summary:|Sub-Total|Total)/i;
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
  // Pending parent: materializes only if no children arrive before the next
  // programme/sub/parent row.
  let pendingParent: {
    row: RawRow;
    children: number;
  } | null = null;

  const flushPendingParent = () => {
    if (!pendingParent) return;
    if (pendingParent.children === 0) {
      // Parent becomes its own tender.
      const built = buildTenderFromRow(pendingParent.row, currentProgramme, currentSub, null, pendingParent.row.B, stats);
      if (built === 'excluded') stats.excluded_lethem_heci++;
      else if (built === 'skipped_nil') stats.skipped_nil_method++;
      else if (built) {
        candidates.push(built);
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
      continue;
    }
    // Sub-programme header (7-digit).
    if (SUB_PROGRAMME_CODE_RE.test(r.A)) {
      flushPendingParent();
      currentSub = r.A;
      currentSubExcluded = r.A === '2606600' || r.A === '2606700';
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

    // Divider rows.
    if (r.B && DIVIDER_RE.test(r.B) && !r.A) {
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
      if (built === 'excluded') stats.excluded_lethem_heci++;
      else if (built === 'skipped_nil') stats.skipped_nil_method++;
      else if (built) candidates.push(built);
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

function buildTenderFromRow(
  r: RawRow,
  programmeCode: string | null,
  subProgrammeCode: string | null,
  _reserved: null,
  programmeActivity: string | null,
  stats: ParseStats,
): ParsedTender | 'excluded' | 'skipped_nil' | null {
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

  // Normalize method.
  const methodResult = normalizeMethod(r.D);
  if (methodResult.skip) return 'skipped_nil';
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
  };
}
