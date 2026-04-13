import { parseSpreadsheet, type ParseResult } from '@/lib/procurement/bulk-upload-parser';
import { parseFlexibleDate, parseMoneyValue } from '@/lib/procurement/data-cleaner';

export { type ParseResult };

// ── Column Mapping ──────────────────────────────────────────────────────────

/** Normalize a header string for matching: lowercase, strip punctuation, collapse whitespace. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Known spreadsheet columns → database field mapping.
 * The spreadsheet has 13 columns with consistent headers.
 */
const COLUMN_MAP: { pattern: string[]; field: string }[] = [
  { pattern: ['project reference'], field: 'project_reference' },
  { pattern: ['executing agency'], field: 'executing_agency' },
  { pattern: ['sub agency', 'subagency'], field: 'sub_agency' },
  { pattern: ['project name'], field: 'project_name' },
  { pattern: ['region'], field: 'region' },
  { pattern: ['tender board type', 'tender board'], field: 'tender_board_type' },
  { pattern: ['contract value'], field: 'contract_value' },
  { pattern: ['contractors', 'contractor'], field: 'contractors' },
  { pattern: ['project end date', 'end date'], field: 'project_end_date' },
  { pattern: ['project status', 'status'], field: 'status' },
  { pattern: ['completion percent', 'completion', 'completion pct'], field: 'completion_percent' },
  { pattern: ['has images'], field: 'has_images' },
];

/** Columns to skip (not mapped to DB fields). */
const SKIP_PATTERNS = ['view project', 'view'];

function mapHeader(header: string): string | null {
  const norm = normalize(header);
  if (SKIP_PATTERNS.some((p) => norm.includes(p))) return null;
  for (const entry of COLUMN_MAP) {
    if (entry.pattern.some((p) => norm.includes(p))) return entry.field;
  }
  return null;
}

// ── Parsed Row ──────────────────────────────────────────────────────────────

export interface ParsedDelayedProject {
  project_reference: string;
  executing_agency: string;
  sub_agency: string;
  project_name: string;
  region: string | null;
  tender_board_type: string | null;
  contract_value: number; // cents
  contractors: string | null;
  project_end_date: string | null; // ISO date
  completion_percent: number;
  has_images: boolean;
  status: string;
}

export interface ParsedUploadResult {
  rows: ParsedDelayedProject[];
  warnings: string[];
  skippedCount: number;
  headers: string[];
  headerMapping: Record<string, string | null>;
}

// ── Main Parser ─────────────────────────────────────────────────────────────

export function parseDelayedProjectsFile(
  data: ArrayBuffer | Buffer,
  sheetName?: string,
): ParsedUploadResult {
  const result = parseSpreadsheet(data, sheetName);
  const warnings: string[] = [];
  let skippedCount = 0;

  // Build header mapping
  const headerMapping: Record<string, string | null> = {};
  for (const h of result.headers) {
    headerMapping[h] = mapHeader(h);
  }

  // Check required columns are mapped
  const mappedFields = new Set(Object.values(headerMapping).filter(Boolean));
  const required = ['project_reference', 'project_name', 'sub_agency'];
  for (const req of required) {
    if (!mappedFields.has(req)) {
      warnings.push(`Required column not found: ${req}`);
    }
  }

  const rows: ParsedDelayedProject[] = [];

  for (let i = 0; i < result.rows.length; i++) {
    const raw = result.rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    // Map raw headers → field values
    const mapped: Record<string, string> = {};
    for (const [header, value] of Object.entries(raw)) {
      const field = headerMapping[header];
      if (field) mapped[field] = value;
    }

    // Skip rows without a project reference
    const ref = mapped.project_reference?.trim();
    if (!ref) {
      skippedCount++;
      continue;
    }

    // Parse contract value → cents
    let contractValueCents = 0;
    if (mapped.contract_value) {
      const parsed = parseMoneyValue(mapped.contract_value);
      if (parsed !== null) {
        contractValueCents = Math.round(parsed * 100);
      } else if (mapped.contract_value.toLowerCase() !== 'none' && mapped.contract_value.trim() !== '') {
        warnings.push(`Row ${rowNum}: Could not parse contract value "${mapped.contract_value}"`);
      }
    }

    // Parse end date
    let endDate: string | null = null;
    if (mapped.project_end_date) {
      endDate = parseFlexibleDate(mapped.project_end_date);
      if (!endDate && mapped.project_end_date.toLowerCase() !== 'none' && mapped.project_end_date.trim() !== '') {
        warnings.push(`Row ${rowNum}: Could not parse end date "${mapped.project_end_date}"`);
      }
    }

    // Parse completion percent
    let completionPct = 0;
    if (mapped.completion_percent) {
      const raw = mapped.completion_percent.replace('%', '').trim();
      const num = parseFloat(raw);
      if (!isNaN(num)) {
        // Handle decimal format (0.30 → 30) vs percentage (30)
        completionPct = num <= 1 && num > 0 ? num * 100 : Math.min(Math.max(num, 0), 100);
      }
    }

    // Parse has_images
    const hasImagesRaw = mapped.has_images?.trim().toLowerCase() || '';
    const hasImagesNum = parseInt(hasImagesRaw, 10);
    const hasImages = hasImagesRaw === 'true' || hasImagesRaw === 'yes' || (!isNaN(hasImagesNum) && hasImagesNum > 0);

    rows.push({
      project_reference: ref,
      executing_agency: mapped.executing_agency?.trim() || 'MOPUA',
      sub_agency: mapped.sub_agency?.trim() || '',
      project_name: mapped.project_name?.trim() || '',
      region: mapped.region?.trim() || null,
      tender_board_type: mapped.tender_board_type?.trim() || null,
      contract_value: contractValueCents,
      contractors: mapped.contractors?.trim() || null,
      project_end_date: endDate,
      completion_percent: Math.round(completionPct * 100) / 100, // 2 decimal places
      has_images: hasImages,
      status: mapped.status?.trim() || 'DELAYED',
    });
  }

  return {
    rows,
    warnings,
    skippedCount,
    headers: result.headers,
    headerMapping,
  };
}
