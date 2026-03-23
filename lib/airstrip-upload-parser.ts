import { parseSpreadsheet, type ParseResult } from '@/lib/procurement/bulk-upload-parser';
import { SURFACE_CONDITIONS, FLIGHT_FREQUENCIES } from '@/lib/airstrip-types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AirstripColumnMapping {
  sourceHeader: string;
  targetField: AirstripTargetField | null;
  confidence: 'high' | 'medium' | 'low';
}

export type AirstripTargetField =
  | 'name'
  | 'region'
  | 'engineered_structure'
  | 'runway_geometry'
  | 'surface_type'
  | 'surface_condition'
  | 'last_inspection_date'
  | 'flight_frequency'
  | 'airside_buildings'
  | 'remarks';

export interface ParsedAirstripRow {
  rowIndex: number;
  name: string | null;
  region: number | null;
  engineered_structure: boolean;
  runway_length_m: number | null;
  runway_width_m: number | null;
  surface_type: string | null;
  surface_condition: string | null;
  last_inspection_date: string | null;
  flight_frequency: string | null;
  airside_buildings: string | null;
  remarks: string | null;
  status: 'valid' | 'warning' | 'error';
  issues: string[];
}

// ── Column ignore list ───────────────────────────────────────────────────────

const IGNORED_PATTERNS = [
  /^no\.?$/i,
  /alternative\s+access/i,
  /maintenance\s+cost/i,
  /proposed\s+maintenance/i,
  /priority/i,
];

// ── Column auto-detection ────────────────────────────────────────────────────

const HEADER_RULES: { pattern: RegExp; field: AirstripTargetField; confidence: 'high' | 'medium' }[] = [
  { pattern: /^(airstrip|name)$/i,                          field: 'name',                confidence: 'high' },
  { pattern: /^region$/i,                                   field: 'region',              confidence: 'high' },
  { pattern: /engineered\s+structure/i,                     field: 'engineered_structure', confidence: 'high' },
  { pattern: /runway\s+geometry/i,                          field: 'runway_geometry',     confidence: 'high' },
  { pattern: /existing\s+surface\s+layer/i,                 field: 'surface_type',        confidence: 'high' },
  { pattern: /surface\s+type/i,                             field: 'surface_type',        confidence: 'medium' },
  { pattern: /surface\s+condition\s*(at\s+last)?/i,         field: 'surface_condition',   confidence: 'high' },
  { pattern: /date\s+of\s+last\s+inspection/i,              field: 'last_inspection_date', confidence: 'high' },
  { pattern: /last\s+inspection/i,                          field: 'last_inspection_date', confidence: 'medium' },
  { pattern: /frequency\s+of\s+flight/i,                    field: 'flight_frequency',    confidence: 'high' },
  { pattern: /flight\s+freq/i,                              field: 'flight_frequency',    confidence: 'medium' },
  { pattern: /airside\s+infrastructure/i,                   field: 'airside_buildings',   confidence: 'high' },
  { pattern: /airside\s+building/i,                         field: 'airside_buildings',   confidence: 'medium' },
  { pattern: /^remarks$/i,                                  field: 'remarks',             confidence: 'high' },
];

export function autoMapColumns(headers: string[]): AirstripColumnMapping[] {
  const usedFields = new Set<AirstripTargetField>();

  return headers.map(h => {
    const trimmed = h.trim();

    // Check ignored columns
    if (IGNORED_PATTERNS.some(p => p.test(trimmed))) {
      return { sourceHeader: h, targetField: null, confidence: 'low' as const };
    }

    // Match against rules
    for (const rule of HEADER_RULES) {
      if (rule.pattern.test(trimmed) && !usedFields.has(rule.field)) {
        usedFields.add(rule.field);
        return { sourceHeader: h, targetField: rule.field, confidence: rule.confidence };
      }
    }

    return { sourceHeader: h, targetField: null, confidence: 'low' as const };
  });
}

// ── Runway geometry parser ───────────────────────────────────────────────────

export function parseRunwayGeometry(value: string): { length: number | null; width: number | null } {
  if (!value || value === '-' || value === '—') {
    return { length: null, width: null };
  }

  let length: number | null = null;
  let width: number | null = null;

  // Match "Length: 518.3m" or "Length: 1,006m"
  const lengthMatch = value.match(/Length\s*:\s*([\d,]+(?:\.\d+)?)\s*m/i);
  if (lengthMatch) {
    const num = parseFloat(lengthMatch[1].replace(/,/g, ''));
    if (!isNaN(num) && num > 0) length = num;
  }

  // Match "Width: 21.3m" or "Width: 15.24m"
  const widthMatch = value.match(/Width\s*:\s*([\d,]+(?:\.\d+)?)\s*m/i);
  if (widthMatch) {
    const num = parseFloat(widthMatch[1].replace(/,/g, ''));
    if (!isNaN(num) && num > 0) width = num;
  }

  return { length, width };
}

// ── Parse file ───────────────────────────────────────────────────────────────

export { parseSpreadsheet };
export type { ParseResult };

// ── Transform raw rows into validated airstrip rows ──────────────────────────

export function transformRows(
  rows: Record<string, string>[],
  mappings: AirstripColumnMapping[],
): ParsedAirstripRow[] {
  // Build a target→source map
  const fieldMap = new Map<AirstripTargetField, string>();
  for (const m of mappings) {
    if (m.targetField) fieldMap.set(m.targetField, m.sourceHeader);
  }

  const get = (row: Record<string, string>, field: AirstripTargetField): string => {
    const header = fieldMap.get(field);
    if (!header) return '';
    return (row[header] ?? '').trim();
  };

  return rows.map((row, idx) => {
    const issues: string[] = [];

    const rawName = get(row, 'name');
    const name = rawName || null;
    if (!name) issues.push('Missing airstrip name');

    const rawRegion = get(row, 'region');
    let region: number | null = null;
    if (rawRegion) {
      const parsed = parseInt(rawRegion, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
        region = parsed;
      } else {
        issues.push(`Invalid region "${rawRegion}" (must be 1–10)`);
      }
    } else {
      issues.push('Missing region');
    }

    const rawEngineered = get(row, 'engineered_structure');
    const engineered_structure = /^yes$/i.test(rawEngineered);

    const rawGeometry = get(row, 'runway_geometry');
    let runway_length_m: number | null = null;
    let runway_width_m: number | null = null;
    if (rawGeometry) {
      const dims = parseRunwayGeometry(rawGeometry);
      runway_length_m = dims.length;
      runway_width_m = dims.width;
      if (dims.length === null && dims.width === null && rawGeometry !== '-' && rawGeometry !== '—') {
        issues.push('Could not parse runway geometry');
      }
    }

    const surface_type = get(row, 'surface_type') || null;

    const rawCondition = get(row, 'surface_condition');
    let surface_condition: string | null = null;
    if (rawCondition) {
      const normalized = rawCondition.charAt(0).toUpperCase() + rawCondition.slice(1).toLowerCase();
      if ((SURFACE_CONDITIONS as readonly string[]).includes(normalized)) {
        surface_condition = normalized;
      } else {
        surface_condition = rawCondition;
        issues.push(`Unrecognized surface condition "${rawCondition}"`);
      }
    }

    const rawDate = get(row, 'last_inspection_date');
    let last_inspection_date: string | null = null;
    if (rawDate) {
      const parsed = parseFlexibleDate(rawDate);
      if (parsed) {
        last_inspection_date = parsed;
      } else {
        issues.push(`Could not parse inspection date "${rawDate}"`);
      }
    }

    const rawFreq = get(row, 'flight_frequency');
    let flight_frequency: string | null = null;
    if (rawFreq) {
      const normalized = rawFreq.charAt(0).toUpperCase() + rawFreq.slice(1).toLowerCase();
      if ((FLIGHT_FREQUENCIES as readonly string[]).includes(normalized)) {
        flight_frequency = normalized;
      } else {
        flight_frequency = rawFreq;
        issues.push(`Unrecognized flight frequency "${rawFreq}"`);
      }
    }

    const airside_buildings = get(row, 'airside_buildings') || null;

    const rawRemarks = get(row, 'remarks');
    const remarks = rawRemarks && rawRemarks !== '-' && rawRemarks !== '—' ? rawRemarks : null;

    // Determine row status
    const hasErrors = !name || (rawRegion && region === null) || (!rawRegion);
    const hasWarnings = issues.length > 0 && !hasErrors;

    return {
      rowIndex: idx + 1,
      name,
      region,
      engineered_structure,
      runway_length_m,
      runway_width_m,
      surface_type,
      surface_condition,
      last_inspection_date,
      flight_frequency,
      airside_buildings,
      remarks,
      status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'valid',
      issues,
    };
  });
}

// ── Date parser ──────────────────────────────────────────────────────────────

function parseFlexibleDate(value: string): string | null {
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // DD-MMM-YYYY (e.g., "24-JAN-2026")
  const dmy = value.match(/^(\d{1,2})[/-](\w{3,})[/-](\d{4})$/);
  if (dmy) {
    const d = new Date(`${dmy[2]} ${dmy[1]}, ${dmy[3]}`);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // MM/DD/YYYY or DD/MM/YYYY — try native parse
  const d = new Date(value);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
    return d.toISOString().slice(0, 10);
  }

  // Excel serial number
  const serial = parseFloat(value);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + serial);
    return epoch.toISOString().slice(0, 10);
  }

  return null;
}

// ── Target fields list for UI ────────────────────────────────────────────────

export const AIRSTRIP_TARGET_FIELDS: { value: AirstripTargetField; label: string }[] = [
  { value: 'name', label: 'Airstrip Name' },
  { value: 'region', label: 'Region' },
  { value: 'engineered_structure', label: 'Engineered Structure' },
  { value: 'runway_geometry', label: 'Runway Geometry' },
  { value: 'surface_type', label: 'Surface Type' },
  { value: 'surface_condition', label: 'Surface Condition' },
  { value: 'last_inspection_date', label: 'Last Inspection Date' },
  { value: 'flight_frequency', label: 'Flight Frequency' },
  { value: 'airside_buildings', label: 'Airside Buildings' },
  { value: 'remarks', label: 'Remarks' },
];
