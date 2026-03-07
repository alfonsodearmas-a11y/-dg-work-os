import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProjectRow {
  project_id: string;
  executing_agency: string | null;
  sub_agency: string | null;
  project_name: string;
  region: string | null;
  tender_board_type: string | null;
  contract_value: number | null;
  contractor: string | null;
  project_end_date: string | null;   // ISO date string
  completion_pct: number;
  has_images: number;
  // Detail fields (from oversight detail page / scraper JSON / XLSX)
  balance_remaining: number | null;
  remarks: string | null;
  project_status: string | null;
  extension_reason: string | null;
  extension_date: string | null;
  project_extended: boolean;
  total_distributed: number | null;
  total_expended: number | null;
}

export interface FundingRow {
  project_id: string;
  date_distributed: string | null;
  payment_type: string | null;
  amount_distributed: number | null;
  amount_expended: number | null;
  distributed_balance: number | null;
  funding_remarks: string | null;
  contract_ref: string | null;
}

export interface ParseResult {
  projects: ProjectRow[];
  agency_counts: Record<string, number>;
  total_value: number;
  /** Raw funding_data JSON strings keyed by project_id (from XLSX funding_data column) */
  funding_data_map: Record<string, string>;
  /** Normalized header names found in the XLSX (for determining which columns are present) */
  found_headers: string[];
  debug: {
    sheet: string;
    totalRows: number;
    headers: string[];
  };
}

// ── Date parsing ───────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/** Parse "24-JAN-2026" → "2026-01-24" ISO date string */
function parseDateDMY(value: string | null | undefined): string | null {
  if (!value || value === '-') return null;
  const str = String(value).trim();

  // DD-MMM-YYYY format
  const match = str.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i);
  if (match) {
    const day = match[1].padStart(2, '0');
    const mon = MONTHS[match[2].toUpperCase()];
    const year = match[3];
    if (mon) return `${year}-${mon}-${day}`;
  }

  // Fallback: try native Date
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

// ── Value parsing ──────────────────────────────────────────────────────────

function parseCurrency(value: any): number | null {
  if (value === null || value === undefined || value === '-' || value === '') return null;
  if (typeof value === 'number') return value;
  const str = String(value);
  // Multi-value cells: "$89,290,200,\r\n\r\n$985,498,500" — split on newlines, sum all
  const parts = str.split(/[\r\n]+/).filter(s => s.trim());
  let total = 0;
  let found = false;
  for (const part of parts) {
    const cleaned = part.replace(/[$,\s]/g, '');
    if (!cleaned) continue;
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      total += num;
      found = true;
    }
  }
  return found ? total : null;
}

function parsePercent(value: any): number {
  if (value === null || value === undefined || value === '-' || value === '') return 0;
  if (typeof value === 'number') {
    // Excel might store 0.30 for 30%
    if (value > 0 && value <= 1) return Math.round(value * 100);
    return Math.round(value);
  }
  const num = parseFloat(String(value).replace('%', '').trim());
  if (isNaN(num)) return 0;
  if (num > 0 && num <= 1) return Math.round(num * 100);
  return Math.round(num);
}

function clean(value: any): string | null {
  if (value === null || value === undefined || value === '-' || value === '') return null;
  const s = String(value).trim();
  return s || null;
}

/** Normalize header string to lowercase snake_case for matching */
function normalizeHeader(h: string): string {
  return h.toLowerCase().trim()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse the Oversight Project Listings Excel format.
 *
 * Core fields (columns A-J) are read by position for backwards compatibility:
 *   A: Project ID  B: Executing Agency  C: Sub Agency  D: Project Name
 *   E: Region  F: Contract Value  G: Contractor(s)  H: Project End Date
 *   I: Completion %  J: Has Images
 *
 * Detail fields are read by HEADER NAME so they work regardless of column position:
 *   balance_remaining, remarks, project_status, extension_reason, extension_date,
 *   total_distributed, total_expended, funding_data
 */
export function parseProjectsExcel(buffer: Buffer): ProjectRow[] {
  return parseProjectsExcelWithDebug(buffer).projects;
}

export function parseProjectsExcelWithDebug(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // Prefer "Project Listings" sheet, fall back to first sheet
  const sheetName = workbook.SheetNames.find(
    s => s.toLowerCase().includes('project')
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];

  if (!rows || rows.length < 2) {
    return {
      projects: [],
      agency_counts: {},
      total_value: 0,
      funding_data_map: {},
      found_headers: [],
      debug: { sheet: sheetName, totalRows: 0, headers: [] },
    };
  }

  // Row 0 is headers, data starts at row 1
  const headers = (rows[0] || []).map((h: any) => String(h || ''));

  // Build header-to-column-index map (normalized names)
  const headerMap: Record<string, number> = {};
  const foundHeaders: string[] = [];
  for (let j = 0; j < headers.length; j++) {
    const normalized = normalizeHeader(headers[j]);
    if (normalized) {
      headerMap[normalized] = j;
      foundHeaders.push(normalized);
    }
  }

  // Helper: get cell value by header name, with optional positional fallback
  function col(r: any[], name: string, fallbackIdx?: number): any {
    // Try all common aliases for the header name
    const idx = headerMap[name];
    if (idx !== undefined) return r[idx];
    if (fallbackIdx !== undefined) return r[fallbackIdx];
    return null;
  }

  const projects: ProjectRow[] = [];
  const agencyCounts: Record<string, number> = {};
  const fundingDataMap: Record<string, string> = {};
  let totalValue = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    // Core fields: try header name first, fall back to positional index
    const projectId = clean(col(r, 'project_id', 0));
    if (!projectId) continue; // skip empty rows

    const subAgency = clean(col(r, 'sub_agency', 2)) || 'MOPUA';
    const contractValue = parseCurrency(col(r, 'contract_value', 5));
    const completionPct = parsePercent(
      col(r, 'completion_pct') ?? col(r, 'completion_percent') ?? r[8]
    );

    const project: ProjectRow = {
      project_id: projectId,
      executing_agency: clean(col(r, 'executing_agency', 1)),
      sub_agency: subAgency,
      project_name: String(col(r, 'project_name', 3) || '').trim(),
      region: clean(col(r, 'region', 4)),
      tender_board_type: (() => {
        const tbVal = col(r, 'tender_board_type');
        if (tbVal) return clean(tbVal);
        // Legacy positional: column F if it looks like an abbreviation
        const v = clean(r[5]);
        return v && /^[A-Z]+$/.test(v) ? v : null;
      })(),
      contract_value: contractValue,
      contractor: clean(col(r, 'contractor') ?? col(r, 'contractors') ?? r[6]),
      project_end_date: parseDateDMY(col(r, 'project_end_date', 7)),
      completion_pct: completionPct,
      has_images: parseInt(String(col(r, 'has_images', 9) || '0'), 10) || 0,

      // Detail fields — read by header name (no positional fallback)
      balance_remaining: parseCurrency(col(r, 'balance_remaining')),
      remarks: clean(col(r, 'remarks')),
      project_status: clean(col(r, 'project_status')),
      extension_reason: clean(col(r, 'extension_reason')),
      extension_date: clean(col(r, 'extension_date')),
      project_extended: (() => {
        const v = col(r, 'project_extended');
        if (v === true || v === 1) return true;
        if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
        return false;
      })(),
      total_distributed: parseCurrency(col(r, 'total_distributed')),
      total_expended: parseCurrency(col(r, 'total_expended')),
    };

    // Collect funding_data JSON strings (will be processed by upload route)
    const fd = col(r, 'funding_data');
    if (fd) {
      const fdStr = String(fd).trim();
      if (fdStr.startsWith('[') || fdStr.startsWith('{')) {
        fundingDataMap[projectId] = fdStr;
      }
    }

    projects.push(project);
    agencyCounts[subAgency] = (agencyCounts[subAgency] || 0) + 1;
    if (contractValue) totalValue += contractValue;
  }

  return {
    projects,
    agency_counts: agencyCounts,
    total_value: totalValue,
    funding_data_map: fundingDataMap,
    found_headers: foundHeaders,
    debug: { sheet: sheetName, totalRows: rows.length, headers },
  };
}
