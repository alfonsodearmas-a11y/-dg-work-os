import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { PSIP_AGENCY, type ProcurementStage } from '@/lib/procurement-types';

// ── PSIP sheet column map ────────────────────────────────────────────────
// Lookup is by header text (case-insensitive, trimmed). If the sheet is
// rearranged, we still find the right column. Required headers MUST be
// present; missing optional headers are treated as null throughout.

const HEADER_ALIASES: Record<keyof PsipColumnIndex, string[]> = {
  psip_ref:                ['psip ref', 'ref', 'ref code', 'reference', 'project id', 'code'],
  status:                  ['tender status', 'status'],
  date_first_advertised:   ['tender advertised', 'date advertised', 'advertised', 'date first advertised'],
  tender_closing_date:     ['tender closed', 'tender closing', 'bid closing', 'closing date'],
  date_eval_submitted_mtb: ['date eval sent for approval (mtb)', 'eval mtb', 'mtb eval', 'mtb'],
  date_eval_submitted_nptab: ['date eval sent for approval (nptab)', 'eval nptab', 'nptab eval', 'nptab'],
  date_of_award:           ['date of award', 'award date', 'awarded'],
  remarks:                 ['remarks', 'notes', 'comments'],
};

interface PsipColumnIndex {
  psip_ref: number;
  status: number;
  date_first_advertised: number;
  tender_closing_date: number;
  date_eval_submitted_mtb: number;
  date_eval_submitted_nptab: number;
  date_of_award: number;
  remarks: number;
}

const REQUIRED_HEADERS: (keyof PsipColumnIndex)[] = ['psip_ref', 'status'];

// ── Status-string → stage-enum map ───────────────────────────────────────
// "See Remarks" deliberately omitted: we copy the remark but do not change
// the stage in that case. Anything not in the map is treated as unmapped.

const STATUS_STAGE_MAP: Record<string, ProcurementStage> = {
  design:         'pre_advertisement',
  advertised:     'advertised',
  evaluation:     'evaluation',
  'awaiting award': 'no_objection',
  award:          'awarded',
  awarded:        'awarded',
};

// ── Types ────────────────────────────────────────────────────────────────

export type PsipMutableField =
  | 'current_stage'
  | 'date_first_advertised'
  | 'tender_closing_date'
  | 'date_eval_submitted_mtb'
  | 'date_eval_submitted_nptab'
  | 'date_of_award'
  | 'psip_remarks';

export interface PsipRow {
  psip_ref: string;
  status_raw: string;
  current_stage: ProcurementStage | null; // null = unmapped or See Remarks
  unmapped_status: boolean;
  date_first_advertised: string | null;
  tender_closing_date: string | null;
  date_eval_submitted_mtb: string | null;
  date_eval_submitted_nptab: string | null;
  date_of_award: string | null;
  psip_remarks: string | null;
}

export interface DbRow {
  id: string;
  agency: string;
  title: string;
  psip_ref: string | null;
  current_stage: ProcurementStage;
  date_first_advertised: string | null;
  tender_closing_date: string | null;
  date_eval_submitted_mtb: string | null;
  date_eval_submitted_nptab: string | null;
  date_of_award: string | null;
  psip_remarks: string | null;
}

export interface FieldChange {
  field: PsipMutableField;
  before: string | null;
  after: string | null;
}

export interface RecordDiff {
  package_id: string;
  psip_ref: string;
  title: string;
  changes: FieldChange[];
  unmapped_status?: string; // set if status string didn't map and we're flagging it
}

export interface SyncDiff {
  changes: RecordDiff[];
  unmatched_sheet_refs: string[]; // PSIP refs in sheet with no DG-OS match
  db_missing_from_sheet: { package_id: string; psip_ref: string; title: string }[];
}

// ── Parse helpers ────────────────────────────────────────────────────────

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildColumnIndex(headerRow: string[]): PsipColumnIndex {
  const normalized = headerRow.map(normalizeHeader);
  const indices = {} as PsipColumnIndex;

  for (const field of Object.keys(HEADER_ALIASES) as (keyof PsipColumnIndex)[]) {
    const aliases = HEADER_ALIASES[field];
    const idx = normalized.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
    indices[field] = idx;
  }

  const missing = REQUIRED_HEADERS.filter((h) => indices[h] < 0);
  if (missing.length > 0) {
    throw new Error(
      `PSIP sheet is missing required header(s): ${missing.join(', ')}. ` +
      `Found headers: ${headerRow.join(' | ')}`,
    );
  }

  return indices;
}

// "24-JAN-2026" | "24/01/2026" | "2026-01-24" → ISO date "2026-01-24".
// Returns null for blanks and unparseable values.
export function parseSheetDate(raw: string): string | null {
  const s = (raw || '').trim();
  if (!s) return null;

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // D-MMM-YYYY or DD-MMM-YYYY
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const m1 = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{4})$/);
  if (m1) {
    const day = m1[1].padStart(2, '0');
    const month = monthMap[m1[2].slice(0, 3).toLowerCase()];
    if (month) return `${m1[3]}-${month}-${day}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m2) {
    return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  }

  return null;
}

function cellAt(row: string[], idx: number): string {
  if (idx < 0) return '';
  return (row[idx] ?? '').trim();
}

function mapStatus(raw: string): { stage: ProcurementStage | null; unmapped: boolean } {
  const k = raw.trim().toLowerCase();
  if (!k) return { stage: null, unmapped: false };
  if (k === 'see remarks') return { stage: null, unmapped: false };
  const stage = STATUS_STAGE_MAP[k];
  return { stage: stage ?? null, unmapped: !stage };
}

/**
 * Parse the PSIP sheet rows (header row + data rows). The first element of
 * `rows` must be the header row.
 */
export function parsePsipRows(rows: string[][]): PsipRow[] {
  if (rows.length === 0) return [];
  const [header, ...data] = rows;
  const idx = buildColumnIndex(header);

  const parsed: PsipRow[] = [];
  for (const row of data) {
    const ref = cellAt(row, idx.psip_ref);
    if (!ref) continue; // skip rows with no PSIP ref
    const statusRaw = cellAt(row, idx.status);
    const { stage, unmapped } = mapStatus(statusRaw);

    parsed.push({
      psip_ref: ref,
      status_raw: statusRaw,
      current_stage: stage,
      unmapped_status: unmapped,
      date_first_advertised:     parseSheetDate(cellAt(row, idx.date_first_advertised)),
      tender_closing_date:       parseSheetDate(cellAt(row, idx.tender_closing_date)),
      date_eval_submitted_mtb:   parseSheetDate(cellAt(row, idx.date_eval_submitted_mtb)),
      date_eval_submitted_nptab: parseSheetDate(cellAt(row, idx.date_eval_submitted_nptab)),
      date_of_award:             parseSheetDate(cellAt(row, idx.date_of_award)),
      psip_remarks:              cellAt(row, idx.remarks) || null,
    });
  }

  return parsed;
}

// ── Diff ─────────────────────────────────────────────────────────────────

/**
 * Compute the diff between PSIP sheet rows and the current DB state for GWI
 * packages that have a psip_ref set. Follows null-safe-strip: a blank sheet
 * cell never overwrites an existing DB value (mirrors projects/upload).
 */
export function diffAgainstDb(psipRows: PsipRow[], dbRows: DbRow[]): SyncDiff {
  const dbByRef = new Map<string, DbRow>();
  for (const r of dbRows) {
    if (r.psip_ref) dbByRef.set(r.psip_ref, r);
  }

  const sheetRefs = new Set<string>();
  const changes: RecordDiff[] = [];
  const unmatched_sheet_refs: string[] = [];

  for (const row of psipRows) {
    sheetRefs.add(row.psip_ref);
    const db = dbByRef.get(row.psip_ref);
    if (!db) {
      unmatched_sheet_refs.push(row.psip_ref);
      continue;
    }

    const fieldChanges: FieldChange[] = [];

    // current_stage: only write if we have a mapped stage AND it differs.
    // Unmapped status → no stage change, but we still propagate remarks.
    if (row.current_stage && row.current_stage !== db.current_stage) {
      fieldChanges.push({
        field: 'current_stage',
        before: db.current_stage,
        after: row.current_stage,
      });
    }

    const dateFields: PsipMutableField[] = [
      'date_first_advertised',
      'tender_closing_date',
      'date_eval_submitted_mtb',
      'date_eval_submitted_nptab',
      'date_of_award',
    ];
    for (const f of dateFields) {
      const after = row[f as keyof PsipRow] as string | null;
      const before = db[f as keyof DbRow] as string | null;
      // Null-safe-strip: blank sheet cell never overwrites a real DB value.
      if (after && after !== before) {
        fieldChanges.push({ field: f, before: before ?? null, after });
      }
    }

    // psip_remarks: overwrite with sheet value when present AND different.
    if (row.psip_remarks && row.psip_remarks !== db.psip_remarks) {
      fieldChanges.push({
        field: 'psip_remarks',
        before: db.psip_remarks ?? null,
        after: row.psip_remarks,
      });
    }

    if (fieldChanges.length > 0 || row.unmapped_status) {
      changes.push({
        package_id: db.id,
        psip_ref: row.psip_ref,
        title: db.title,
        changes: fieldChanges,
        unmapped_status: row.unmapped_status ? row.status_raw : undefined,
      });
    }
  }

  const db_missing_from_sheet = dbRows
    .filter((r) => r.psip_ref && !sheetRefs.has(r.psip_ref))
    .map((r) => ({ package_id: r.id, psip_ref: r.psip_ref as string, title: r.title }));

  return { changes, unmatched_sheet_refs, db_missing_from_sheet };
}

// ── DB read/apply ────────────────────────────────────────────────────────

/**
 * Load the DB rows needed for diffing against the sheet, scoped to rows
 * that have a psip_ref set (unlinked rows never participate in the diff).
 */
export async function loadDbRowsForAgency(agency: string): Promise<DbRow[]> {
  const { data, error } = await supabaseAdmin
    .from('procurement_packages')
    .select('id, agency, title, psip_ref, current_stage, date_first_advertised, tender_closing_date, date_eval_submitted_mtb, date_eval_submitted_nptab, date_of_award, psip_remarks')
    .ilike('agency', agency)
    .not('psip_ref', 'is', null);
  if (error) throw error;
  return (data || []) as unknown as DbRow[];
}

/**
 * Extract the configured tab + cell range from an uploaded xlsx buffer,
 * returning a 2D array of strings (header row first).
 */
export function readXlsxRange(buffer: Buffer): string[][] {
  const tab = process.env.PSIP_GWI_TAB;
  const range = process.env.PSIP_GWI_RANGE;
  if (!tab || !range) {
    throw new Error('PSIP upload is not configured. Set PSIP_GWI_TAB and PSIP_GWI_RANGE in .env.local.');
  }

  const workbook = XLSX.read(buffer, { type: 'buffer', sheets: [tab] });
  const sheet = workbook.Sheets[tab];
  if (!sheet) {
    const available = workbook.SheetNames.map((n) => `"${n}"`).join(', ');
    throw new Error(`Tab "${tab}" not found in uploaded file. Available tabs: ${available}`);
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    range,
    header: 1,
    blankrows: false,
    defval: '',
  });
  return rows.map((r) => (r as unknown[]).map((c) => (c == null ? '' : String(c))));
}

/**
 * Parse an uploaded PSIP xlsx buffer and produce a diff against GWI packages.
 * DB read runs in parallel with xlsx parsing since they're independent.
 */
export async function computePsipDiffFromXlsx(buffer: Buffer): Promise<SyncDiff> {
  const dbRowsPromise = loadDbRowsForAgency(PSIP_AGENCY);
  const psipRows = parsePsipRows(readXlsxRange(buffer));
  const dbRows = await dbRowsPromise;
  return diffAgainstDb(psipRows, dbRows);
}

/**
 * Apply the exact changes the user approved. Each record is written with a
 * single UPDATE plus an optional stage_history insert if current_stage
 * moved. Applying the user-approved payload directly (rather than
 * recomputing from the sheet) preserves the "no silent overwrite" guarantee
 * — we never write something the user didn't see and check.
 *
 * Returns the package ids that were successfully applied.
 */
export async function applyChanges(
  approvedChanges: RecordDiff[],
  userId: string,
): Promise<{ applied: string[]; failed: { package_id: string; error: string }[] }> {
  const applied: string[] = [];
  const failed: { package_id: string; error: string }[] = [];

  for (const record of approvedChanges) {
    if (record.changes.length === 0) continue;
    try {
      const update: Record<string, unknown> = { psip_last_synced_at: new Date().toISOString() };
      let stageChange: { from: ProcurementStage; to: ProcurementStage } | null = null;

      for (const change of record.changes) {
        if (change.field === 'current_stage') {
          update.current_stage = change.after;
          stageChange = {
            from: change.before as ProcurementStage,
            to: change.after as ProcurementStage,
          };
        } else {
          update[change.field] = change.after;
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from('procurement_packages')
        .update(update)
        .eq('id', record.package_id);
      if (updateError) throw updateError;

      if (stageChange) {
        const { error: historyError } = await supabaseAdmin
          .from('procurement_stage_history')
          .insert({
            package_id: record.package_id,
            from_stage: stageChange.from,
            to_stage: stageChange.to,
            changed_by: userId,
            notes: 'PSIP sync',
          });
        if (historyError) throw historyError;
      }

      applied.push(record.package_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err, packageId: record.package_id }, 'procurement-psip-sync: apply failed');
      failed.push({ package_id: record.package_id, error: msg });
    }
  }

  return { applied, failed };
}
