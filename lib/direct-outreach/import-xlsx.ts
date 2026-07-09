// Direct Outreach — Excel workbook ingestion. The OP Direct owners share the
// case load as an .xlsx export (there is no API access), so ingestion is a
// FULL SNAPSHOT REPLACE: wipe the mirror, insert the workbook's cases and
// comment log, recompute the per-case rollups, stamp sync_state.
//
// Column mapping is BY HEADER NAME (found via the row containing "Case ID"),
// never by index, so column reorders in future exports don't break the import.
// Server-only (db-pg); the pure parsing half is exported for tests.

import * as XLSX from 'xlsx';
import { transaction } from '@/lib/db-pg';
import { logger } from '@/lib/logger';
import { classifyTheme, extractTargetDate, isSubstantive, priorityFlag } from './compute';
import type { OutreachUploadSummary } from './types';

/** Workbook-shape problems the upload route reports back as a 400. */
export class OutreachImportError extends Error {}

const DATA_SHEET = 'Data';
const COMMENTS_SHEET = 'Comments Log';
const HEADER_SCAN_ROWS = 25; // header is row 1 (Data) / row 4 (Comments Log) today; scan generously

export interface ParsedCase {
  case_id: number;
  agency: string | null;
  status: string | null;
  priority: number;
  priority_flag: string;
  theme: string;
  category_name: string | null;
  description: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_address: string | null;
  outreach_location: string | null;
  outreach_date: string | null;
  /** Optional workbook columns — null when the uploaded workbook lacks them. */
  region: string | null;
  point_person: string | null;
  created_at: string | null;
  // Rollups (computed from the parsed comment log)
  latest_update: string | null;
  latest_update_date: string | null;
  latest_update_by: string | null;
  comment_count: number;
  last_activity_at: string | null;
  committed_date: string | null;
  committed_source: string | null;
  committed_by: string | null;
}

export interface ParsedUpdate {
  /** Synthesized 1-based sequence — the sheet has no case_detail_id, but the
   *  column is NOT NULL UNIQUE; full-snapshot replace makes per-upload
   *  sequences safe. */
  entry_ref: number;
  case_id: number;
  agency: string | null;
  creator_agency: string | null;
  status: string | null;
  comment: string | null;
  username: string | null;
  /** Full "AGENCY/username" author string, used verbatim in the rollups. */
  author: string | null;
  created_at: string | null;
}

export interface ParsedWorkbook {
  cases: ParsedCase[];
  updates: ParsedUpdate[];
  /** Comment rows dropped because their Case ID isn't in the Data sheet (FK safety). */
  skipped_updates: number;
  /** Data rows dropped because their Case ID repeated an earlier row. */
  duplicate_cases: number;
  /** Data rows dropped because the Case ID cell was non-empty but not a valid integer. */
  invalid_case_rows: number;
}

// ── Cell readers ─────────────────────────────────────────────────────────────

const normHeader = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function text(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function int(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isSafeInteger(v) ? v : null;
  // Strict: '1,234' or '12abc' must not silently become 1 / 12 via parseInt.
  const s = String(v).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isSafeInteger(n) ? n : null;
}

// ── Workbook dates ────────────────────────────────────────────────────────────
// The workbook's date cells are Guyana wall-clock times. xlsx (cellDates:true)
// materialises them as Dates whose LOCAL components equal that wall clock —
// which toISOString() would silently rebase onto the SERVER's timezone (UTC on
// Vercel), landing date-only cells 4h early and shifting them onto the previous
// Guyana calendar day in the migration-145 view. So: read the wall-clock
// components and pin them to America/Guyana, which is fixed UTC-4 (no DST).

const GUYANA_OFFSET_HOURS = 4;

interface WallClock { y: number; mo: number; d: number; h: number; mi: number; s: number }

function wallFromLocalDate(v: Date): WallClock {
  return { y: v.getFullYear(), mo: v.getMonth(), d: v.getDate(), h: v.getHours(), mi: v.getMinutes(), s: v.getSeconds() };
}

/** Raw Excel serial (numeric cell that escaped cellDates) → wall clock via UTC math. */
function wallFromSerial(n: number): WallClock {
  const v = new Date(Math.round((n - 25569) * 86_400_000));
  return { y: v.getUTCFullYear(), mo: v.getUTCMonth(), d: v.getUTCDate(), h: v.getUTCHours(), mi: v.getUTCMinutes(), s: v.getUTCSeconds() };
}

function wallToInstantISO(w: WallClock): string {
  return new Date(Date.UTC(w.y, w.mo, w.d, w.h + GUYANA_OFFSET_HOURS, w.mi, w.s)).toISOString();
}

function wallToDateOnly(w: WallClock): string {
  return `${w.y}-${String(w.mo + 1).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

function toWall(v: unknown): WallClock | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : wallFromLocalDate(v);
  if (typeof v === 'number') return wallFromSerial(v);
  // String date cell: JS-parse (local wall clock), else null — never hand a raw
  // string to Postgres, whose DateStyle could disagree with the JS rollup sort.
  const parsed = new Date(String(v).trim());
  return Number.isNaN(parsed.getTime()) ? null : wallFromLocalDate(parsed);
}

function toTimestamp(v: unknown): string | null {
  const w = toWall(v);
  return w ? wallToInstantISO(w) : null;
}

function toDateOnly(v: unknown): string | null {
  const w = toWall(v);
  return w ? wallToDateOnly(w) : null;
}

// ── Sheet plumbing ───────────────────────────────────────────────────────────

function getSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet {
  const exact = wb.Sheets[name];
  if (exact) return exact;
  const found = wb.SheetNames.find((n) => normHeader(n) === normHeader(name));
  if (found) return wb.Sheets[found];
  throw new OutreachImportError(
    `Workbook is missing the "${name}" sheet (found: ${wb.SheetNames.join(', ')})`,
  );
}

interface SheetTable {
  headerIndex: Map<string, number>;
  rows: unknown[][];
}

/** Find the header row (the one containing "Case ID") and return the rows below it. */
function readTable(sheet: XLSX.WorkSheet, sheetName: string): SheetTable {
  const all = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
  for (let i = 0; i < Math.min(all.length, HEADER_SCAN_ROWS); i++) {
    const row = all[i] ?? [];
    if (row.some((c) => normHeader(c) === 'case id')) {
      const headerIndex = new Map<string, number>();
      row.forEach((c, col) => {
        const key = normHeader(c);
        if (key && !headerIndex.has(key)) headerIndex.set(key, col);
      });
      return { headerIndex, rows: all.slice(i + 1) };
    }
  }
  throw new OutreachImportError(`Sheet "${sheetName}" has no header row containing "Case ID"`);
}

function requireColumns(table: SheetTable, sheetName: string, names: string[]): void {
  const missing = names.filter((n) => !table.headerIndex.has(normHeader(n)));
  if (missing.length > 0) {
    throw new OutreachImportError(
      `Sheet "${sheetName}" is missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
    );
  }
}

/** Column accessor by header name; returns null for absent optional columns. */
function reader(table: SheetTable) {
  return (row: unknown[], header: string): unknown => {
    const col = table.headerIndex.get(normHeader(header));
    return col === undefined ? null : row[col];
  };
}

// ── Rollups (same semantics as the retired API sync) ─────────────────────────

function entryTime(u: ParsedUpdate): number {
  const t = u.created_at ? new Date(u.created_at).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function applyRollups(cases: Map<number, ParsedCase>, updates: ParsedUpdate[]): void {
  const byCase = new Map<number, ParsedUpdate[]>();
  for (const u of updates) {
    const list = byCase.get(u.case_id);
    if (list) list.push(u);
    else byCase.set(u.case_id, [u]);
  }

  for (const [caseId, list] of byCase) {
    const c = cases.get(caseId);
    if (!c) continue;
    // entry_ref DESC tiebreak: date-only cells make every same-day comment tie
    // at midnight, and the detail panel orders created_at DESC, entry_ref DESC
    // (queries.ts) — later sheet row = newer must win here too.
    const sorted = [...list].sort(
      (a, b) => entryTime(b) - entryTime(a) || b.entry_ref - a.entry_ref,
    );
    const substantive = sorted.filter((u) => isSubstantive(u.comment));
    const latest = substantive[0] ?? null;

    c.last_activity_at = sorted[0]?.created_at ?? c.created_at;
    c.latest_update = latest?.comment ?? null;
    c.latest_update_date = latest?.created_at ?? null;
    c.latest_update_by = latest?.author ?? null;
    c.comment_count = substantive.length;

    for (const u of substantive) {
      const hit = extractTargetDate(u.comment);
      if (hit) {
        c.committed_date = hit.date;
        c.committed_source = u.comment ?? '';
        c.committed_by = u.author;
        break;
      }
    }
  }
}

// ── Pure parse (exported for tests) ──────────────────────────────────────────

export function parseOutreachWorkbook(buffer: Buffer): ParsedWorkbook {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw new OutreachImportError('File could not be read as an Excel workbook');
  }

  // Sheet "Data" → cases
  const dataTable = readTable(getSheet(wb, DATA_SHEET), DATA_SHEET);
  requireColumns(dataTable, DATA_SHEET, ['Case ID', 'Agency', 'Status', 'Issue Description']);
  const d = reader(dataTable);

  const cases = new Map<number, ParsedCase>();
  let duplicateCases = 0;
  let invalidCaseRows = 0;
  for (const row of dataTable.rows) {
    const rawCaseId = d(row, 'Case ID');
    const caseId = int(rawCaseId);
    if (caseId === null) {
      // Blank spacer/totals rows pass silently; a populated-but-invalid cell
      // ('1,234', '12abc', float artifacts) is counted so it can't vanish.
      if (text(rawCaseId) !== null) invalidCaseRows++;
      continue;
    }
    if (cases.has(caseId)) {
      duplicateCases++;
      continue;
    }
    const agency = text(d(row, 'Agency'));
    const description = text(d(row, 'Issue Description'));
    const category = text(d(row, 'Service Category')); // schema home: category_name
    const priority = int(d(row, 'Priority Code')) ?? 0;
    cases.set(caseId, {
      case_id: caseId,
      agency,
      status: text(d(row, 'Status')),
      priority,
      priority_flag: text(d(row, 'Priority Flag')) ?? priorityFlag(priority),
      theme: text(d(row, 'Issue Theme')) ?? classifyTheme(description, category, agency),
      category_name: category,
      description,
      client_name: text(d(row, 'Client Name')),
      client_phone: text(d(row, 'Contact')),
      client_address: text(d(row, 'Locality / Address')),
      outreach_location: text(d(row, 'Outreach Location')),
      outreach_date: toDateOnly(d(row, 'Outreach Date')),
      // Optional headers (newer workbooks) — reader() yields null when absent,
      // so an older workbook without these columns still uploads cleanly.
      region: text(d(row, 'Region')),
      point_person: text(d(row, 'Point Person')),
      created_at: toTimestamp(d(row, 'Date Logged')),
      // Rollups filled by applyRollups; defaults for cases with no comments
      latest_update: null,
      latest_update_date: null,
      latest_update_by: null,
      comment_count: 0,
      last_activity_at: toTimestamp(d(row, 'Date Logged')),
      committed_date: null,
      committed_source: null,
      committed_by: null,
    });
  }
  if (cases.size === 0) {
    throw new OutreachImportError(`Sheet "${DATA_SHEET}" contains no rows with a valid Case ID`);
  }

  // Sheet "Comments Log" → updates
  const commentsTable = readTable(getSheet(wb, COMMENTS_SHEET), COMMENTS_SHEET);
  requireColumns(commentsTable, COMMENTS_SHEET, ['Case ID', 'Date', 'Author', 'Comment']);
  const c = reader(commentsTable);

  const updates: ParsedUpdate[] = [];
  let skippedUpdates = 0;
  let entryRef = 0;
  for (const row of commentsTable.rows) {
    const caseId = int(c(row, 'Case ID'));
    if (caseId === null) continue;
    if (!cases.has(caseId)) {
      skippedUpdates++; // no parent case row — would violate the FK
      continue;
    }
    const author = text(c(row, 'Author'));
    let creatorAgency: string | null = null;
    let username: string | null = author;
    if (author && author.includes('/')) {
      const slash = author.indexOf('/');
      creatorAgency = author.slice(0, slash).trim() || null;
      username = author.slice(slash + 1).trim() || null;
    }
    updates.push({
      entry_ref: ++entryRef,
      case_id: caseId,
      agency: text(c(row, 'Agency')),
      creator_agency: creatorAgency,
      status: text(c(row, 'Status at Entry')),
      comment: text(c(row, 'Comment')),
      username,
      author,
      created_at: toTimestamp(c(row, 'Date')),
    });
  }

  applyRollups(cases, updates);

  return {
    cases: [...cases.values()],
    updates,
    skipped_updates: skippedUpdates,
    duplicate_cases: duplicateCases,
    invalid_case_rows: invalidCaseRows,
  };
}

// ── Import (full snapshot replace, one transaction) ──────────────────────────

const CASE_COLUMNS = [
  'case_id', 'agency', 'status', 'priority', 'priority_flag', 'theme', 'category_name',
  'description', 'client_name', 'client_phone', 'client_address', 'outreach_location',
  'outreach_date', 'region', 'point_person', 'created_at',
  'latest_update', 'latest_update_date', 'latest_update_by',
  'comment_count', 'last_activity_at', 'committed_date', 'committed_source', 'committed_by',
] as const;

const UPDATE_COLUMNS = [
  'entry_ref', 'case_id', 'agency', 'creator_agency', 'status', 'comment', 'username', 'created_at',
] as const;

const CASE_CHUNK = 400; // 24 params/row → 9.6k params/statement, well under pg's 65k cap
const UPDATE_CHUNK = 800; // 8 params/row

function valuesClause(rowCount: number, colCount: number): string {
  const rows: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const base = r * colCount;
    const ps = Array.from({ length: colCount }, (_, i) => `$${base + i + 1}`);
    rows.push(`(${ps.join(',')})`);
  }
  return rows.join(',');
}

export async function importOutreachWorkbook(buffer: Buffer): Promise<OutreachUploadSummary> {
  const parsed = parseOutreachWorkbook(buffer);
  if (parsed.skipped_updates > 0 || parsed.duplicate_cases > 0 || parsed.invalid_case_rows > 0) {
    logger.warn(
      {
        skipped_updates: parsed.skipped_updates,
        duplicate_cases: parsed.duplicate_cases,
        invalid_case_rows: parsed.invalid_case_rows,
      },
      '[direct-outreach] workbook rows dropped during import',
    );
  }

  await transaction(async (client) => {
    // Snapshot replace — updates first (FK references cases)
    await client.query('DELETE FROM direct_outreach_updates');
    await client.query('DELETE FROM direct_outreach_cases');

    for (let i = 0; i < parsed.cases.length; i += CASE_CHUNK) {
      const chunk = parsed.cases.slice(i, i + CASE_CHUNK);
      const params = chunk.flatMap((row) => CASE_COLUMNS.map((col) => row[col]));
      await client.query(
        `INSERT INTO direct_outreach_cases (
           case_id, agency, status, priority, priority_flag, theme, category_name,
           description, client_name, client_phone, client_address, outreach_location,
           outreach_date, region, point_person, created_at,
           latest_update, latest_update_date, latest_update_by,
           comment_count, last_activity_at, committed_date, committed_source, committed_by
         ) VALUES ${valuesClause(chunk.length, CASE_COLUMNS.length)}`,
        params,
      );
    }

    for (let i = 0; i < parsed.updates.length; i += UPDATE_CHUNK) {
      const chunk = parsed.updates.slice(i, i + UPDATE_CHUNK);
      const params = chunk.flatMap((row) => UPDATE_COLUMNS.map((col) => row[col]));
      await client.query(
        `INSERT INTO direct_outreach_updates (
           entry_ref, case_id, agency, creator_agency, status, comment, username, created_at
         ) VALUES ${valuesClause(chunk.length, UPDATE_COLUMNS.length)}`,
        params,
      );
    }

    // Reused as the "last uploaded" stamp shown in the dashboard header.
    await client.query(
      `UPDATE direct_outreach_sync_state
          SET last_synced_at = now(), cases_seen = $1, updates_seen = $2
        WHERE id = 1`,
      [parsed.cases.length, parsed.updates.length],
    );
  });

  const resolved = parsed.cases.filter((c) => c.status === 'Resolved').length;
  const summary: OutreachUploadSummary = {
    cases: parsed.cases.length,
    updates: parsed.updates.length,
    open: parsed.cases.length - resolved,
    resolved,
  };
  logger.info(summary, '[direct-outreach] workbook import complete');
  return summary;
}
