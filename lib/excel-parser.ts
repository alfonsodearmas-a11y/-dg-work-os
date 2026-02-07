import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProjectRow {
  project_id: string;
  executing_agency: string | null;
  sub_agency: string | null;
  project_name: string;
  region: string | null;
  contract_value: number | null;
  contractor: string | null;
  project_end_date: string | null;   // ISO date string
  completion_pct: number;
  has_images: number;
}

export interface ParseResult {
  projects: ProjectRow[];
  agency_counts: Record<string, number>;
  total_value: number;
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

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse the Oversight Project Listings Excel format.
 * Fixed column layout:
 *   A: Project ID  B: Executing Agency  C: Sub Agency  D: Project Name
 *   E: Region  F: Contract Value  G: Contractor(s)  H: Project End Date
 *   I: Completion %  J: Has Images
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
      debug: { sheet: sheetName, totalRows: 0, headers: [] },
    };
  }

  // Row 0 is headers, data starts at row 1
  const headers = (rows[0] || []).map((h: any) => String(h || ''));

  const projects: ProjectRow[] = [];
  const agencyCounts: Record<string, number> = {};
  let totalValue = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const projectId = clean(r[0]);
    if (!projectId) continue; // skip empty rows

    const subAgency = clean(r[2]) || 'MOPUA'; // "-" becomes MOPUA
    const contractValue = parseCurrency(r[5]);
    const completionPct = parsePercent(r[8]);

    const project: ProjectRow = {
      project_id: projectId,
      executing_agency: clean(r[1]),
      sub_agency: subAgency,
      project_name: String(r[3] || '').trim(),
      region: clean(r[4]),
      contract_value: contractValue,
      contractor: clean(r[6]),
      project_end_date: parseDateDMY(r[7]),
      completion_pct: completionPct,
      has_images: parseInt(String(r[9] || '0'), 10) || 0,
    };

    projects.push(project);
    agencyCounts[subAgency] = (agencyCounts[subAgency] || 0) + 1;
    if (contractValue) totalValue += contractValue;
  }

  return {
    projects,
    agency_counts: agencyCounts,
    total_value: totalValue,
    debug: { sheet: sheetName, totalRows: rows.length, headers },
  };
}
