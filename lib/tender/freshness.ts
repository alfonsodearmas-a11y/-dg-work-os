// ── Tender freshness: snapshot + diff ────────────────────────────────────────
//
// Supports stagnant-tender detection by snapshotting the diffable tender
// fields per PSIP upload, then comparing the current snapshot to the most
// recent prior snapshot for the same tender.
//
// The ingest pipeline calls buildTenderSnapshot + writeUploadSnapshots after
// it has applied NEW/UPDATE operations. `diffTenderSnapshots` is pure and
// testable in isolation; it normalizes dates and applies numeric tolerance
// before comparing so that representational differences (Excel serial vs
// Date vs ISO string) do not look like changes.

export const SNAPSHOT_FIELDS = [
  'stage',
  'date_advertised',
  'date_closed',
  'date_eval_sent_mtb_rtb',
  'date_eval_sent_nptab',
  'date_of_award',
  'contractor',
  'implementation_status_pct',
  'implementation_start_date',
  'implementation_end_date',
  'remarks',
] as const;

export type SnapshotField = typeof SNAPSHOT_FIELDS[number];
export type TenderSnapshot = Partial<Record<SnapshotField, unknown>>;

const DATE_FIELDS: ReadonlySet<SnapshotField> = new Set([
  'date_advertised',
  'date_closed',
  'date_eval_sent_mtb_rtb',
  'date_eval_sent_nptab',
  'date_of_award',
  'implementation_start_date',
  'implementation_end_date',
]);

const NUMBER_FIELDS: ReadonlySet<SnapshotField> = new Set([
  'implementation_status_pct',
]);

const NUMERIC_TOLERANCE = 0.001;

// Excel's serial date epoch (1899-12-30 UTC) in JS milliseconds. Accounts for
// Lotus 1-2-3's 1900-leap-year bug inherited by Excel.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

export function normalizeDateLike(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    const ms = EXCEL_EPOCH_MS + v * DAY_MS;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    // Already looks like an ISO date / datetime — take the date part.
    const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    if (iso) return iso[1];
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function numbersEqual(a: unknown, b: unknown): boolean {
  const an = a === null || a === undefined ? null : Number(a);
  const bn = b === null || b === undefined ? null : Number(b);
  if (an === null && bn === null) return true;
  if (an === null || bn === null) return false;
  if (!Number.isFinite(an) || !Number.isFinite(bn)) return false;
  return Math.abs(an - bn) < NUMERIC_TOLERANCE;
}

function stringishEqual(a: unknown, b: unknown): boolean {
  const as = a === null || a === undefined || a === '' ? null : String(a);
  const bs = b === null || b === undefined || b === '' ? null : String(b);
  return as === bs;
}

export interface DiffResult {
  changed: boolean;
  changedFields: SnapshotField[];
}

export function diffTenderSnapshots(curr: TenderSnapshot, prev: TenderSnapshot): DiffResult {
  const changedFields: SnapshotField[] = [];
  for (const f of SNAPSHOT_FIELDS) {
    const a = curr[f];
    const b = prev[f];
    let equal: boolean;
    if (DATE_FIELDS.has(f)) equal = normalizeDateLike(a) === normalizeDateLike(b);
    else if (NUMBER_FIELDS.has(f)) equal = numbersEqual(a, b);
    else equal = stringishEqual(a, b);
    if (!equal) changedFields.push(f);
  }
  return { changed: changedFields.length > 0, changedFields };
}

// ── Shape used by the ingest pipeline ────────────────────────────────────────

export interface TenderRowForSnapshot {
  stage: string;
  date_advertised: string | null;
  date_closed: string | null;
  date_eval_sent_mtb_rtb: string | null;
  date_eval_sent_nptab: string | null;
  date_of_award: string | null;
  contractor: string | null;
  implementation_status_pct: number | null;
  implementation_start_date: string | null;
  implementation_end_date: string | null;
  remarks: string | null;
}

export function buildTenderSnapshot(row: TenderRowForSnapshot): TenderSnapshot {
  return {
    stage: row.stage,
    date_advertised: row.date_advertised,
    date_closed: row.date_closed,
    date_eval_sent_mtb_rtb: row.date_eval_sent_mtb_rtb,
    date_eval_sent_nptab: row.date_eval_sent_nptab,
    date_of_award: row.date_of_award,
    contractor: row.contractor,
    implementation_status_pct: row.implementation_status_pct,
    implementation_start_date: row.implementation_start_date,
    implementation_end_date: row.implementation_end_date,
    remarks: row.remarks,
  };
}
