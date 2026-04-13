import type { ParsedDelayedProject } from './upload-parser';
import { SUB_AGENCY_OPTIONS } from '@/components/oversight/types';

// ── Validation Types ────────────────────────────────────────────────────────

export type RowStatus = 'valid' | 'warning' | 'blocked';

export interface ValidatedRow {
  rowIndex: number;
  status: RowStatus;
  issues: string[];
  data: ParsedDelayedProject;
}

export interface ValidationResult {
  rows: ValidatedRow[];
  valid: number;
  warnings: number;
  blocked: number;
}

// ── Sub-Agency Whitelist ────────────────────────────────────────────────────

const VALID_SUB_AGENCIES = new Set(SUB_AGENCY_OPTIONS);

// ── Validator ───────────────────────────────────────────────────────────────

export function validateRows(rows: ParsedDelayedProject[]): ValidationResult {
  let valid = 0;
  let warnings = 0;
  let blocked = 0;

  const validatedRows: ValidatedRow[] = rows.map((row, i) => {
    const issues: string[] = [];
    let status: RowStatus = 'valid';

    // Required fields — BLOCK if missing
    if (!row.project_reference) {
      issues.push('Missing project reference');
      status = 'blocked';
    }
    if (!row.project_name) {
      issues.push('Missing project name');
      status = 'blocked';
    }
    if (!row.sub_agency) {
      issues.push('Missing sub agency');
      status = 'blocked';
    }

    // Warnings — import proceeds but flag issues
    if (row.sub_agency && !VALID_SUB_AGENCIES.has(row.sub_agency.toUpperCase())) {
      issues.push(`Unknown sub agency: ${row.sub_agency}`);
      if (status === 'valid') status = 'warning';
    }

    if (row.contract_value === 0) {
      issues.push('No contract value');
      if (status === 'valid') status = 'warning';
    }

    if (!row.project_end_date) {
      issues.push('No end date');
      if (status === 'valid') status = 'warning';
    }

    if (row.completion_percent < 0 || row.completion_percent > 100) {
      issues.push(`Completion percent out of range: ${row.completion_percent}`);
      if (status === 'valid') status = 'warning';
    }

    if (status === 'blocked') blocked++;
    else if (status === 'warning') warnings++;
    else valid++;

    return {
      rowIndex: i,
      status,
      issues,
      data: row,
    };
  });

  return { rows: validatedRows, valid, warnings, blocked };
}
