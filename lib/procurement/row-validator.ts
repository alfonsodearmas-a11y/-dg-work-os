import type { ColumnMapping } from './column-mapper';
import type { ProcurementStage } from '@/lib/procurement-types';
import { METHOD_CONFIG, PROCUREMENT_STAGES } from '@/lib/procurement-types';
import {
  parseFlexibleDate,
  parseMoneyValue,
  inferStatus,
  cleanTextField,
  normalizeBidReference,
} from './data-cleaner';

// ── Types ────────────────────────────────────────────────────────────────────

export type RowStatus = 'valid' | 'warning' | 'blocked';

export interface ValidatedRow {
  rowIndex: number;
  status: RowStatus;
  issues: string[];
  /** Resolved stage from inferStatus or default */
  resolvedStage: string;
  /** Whether status was auto-detected from remarks */
  stageAutoDetected: boolean;
  /** Cleaned field values ready for import */
  fields: {
    title: string;
    description: string | null;
    bid_reference: string | null;
    estimated_value: number | null;
    procurement_method: string | null;
    opening_date: string | null;
    tender_board: string | null;
    expected_delivery_date: string | null;
    notes: string | null;
  };
}

export interface ValidationResult {
  rows: ValidatedRow[];
  counts: { valid: number; warning: number; blocked: number };
}

// ── Validator ────────────────────────────────────────────────────────────────

const METHOD_ALIASES: Record<string, string> = {
  'open tender': 'open_tender',
  'open': 'open_tender',
  'ot': 'open_tender',
  'icb': 'open_tender',
  'ncb': 'open_tender',
  'selective': 'selective_tender',
  'selective tender': 'selective_tender',
  'sole source': 'sole_source',
  'sole': 'sole_source',
  'ss': 'sole_source',
  'rfq': 'request_for_quotation',
  'request for quotation': 'request_for_quotation',
  'quotation': 'request_for_quotation',
};

function resolveMethod(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  if (!lower) return null;
  // Exact match on key
  if (lower in METHOD_CONFIG) return lower;
  // Alias lookup
  return METHOD_ALIASES[lower] ?? null;
}

/**
 * Extract a field value from a raw row using the column mappings.
 */
function extractField(
  row: Record<string, string>,
  mappings: ColumnMapping[],
  targetField: string,
): string {
  const mapping = mappings.find((m) => m.targetField === targetField);
  if (!mapping) return '';
  return row[mapping.sourceHeader] ?? '';
}

/**
 * Validate and clean all rows, returning structured results.
 */
export function validateRows(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
  defaultStage: ProcurementStage,
): ValidationResult {
  const counts = { valid: 0, warning: 0, blocked: 0 };
  const validatedRows: ValidatedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const issues: string[] = [];
    let status: RowStatus = 'valid';

    // Extract raw values
    const rawTitle = extractField(row, mappings, 'title');
    const rawDesc = extractField(row, mappings, 'description');
    const rawBidRef = extractField(row, mappings, 'bid_reference');
    const rawValue = extractField(row, mappings, 'estimated_value');
    const rawMethod = extractField(row, mappings, 'procurement_method');
    const rawOpenDate = extractField(row, mappings, 'opening_date');
    const rawBoard = extractField(row, mappings, 'tender_board');
    const rawDelivery = extractField(row, mappings, 'expected_delivery_date');
    const rawNotes = extractField(row, mappings, 'notes');

    // ── Clean & validate ─────────────────────────────────────────────

    // Title (required)
    const title = cleanTextField(rawTitle);
    if (!title) {
      issues.push('Missing required field: title');
      status = 'blocked';
    }

    // Description
    const description = rawDesc ? cleanTextField(rawDesc) : null;

    // Bid reference
    const bid_reference = rawBidRef ? normalizeBidReference(rawBidRef) : null;

    // Estimated value
    let estimated_value: number | null = null;
    if (rawValue) {
      estimated_value = parseMoneyValue(rawValue);
      if (estimated_value === null) {
        issues.push(`Could not parse value: "${rawValue}"`);
        if (status === 'valid') status = 'warning';
      } else if (estimated_value <= 0) {
        issues.push('Estimated value must be positive');
        if (status === 'valid') status = 'warning';
      }
    }

    // Procurement method
    let procurement_method: string | null = null;
    if (rawMethod) {
      procurement_method = resolveMethod(rawMethod);
      if (!procurement_method) {
        issues.push(`Unknown method: "${rawMethod}"`);
        if (status === 'valid') status = 'warning';
      }
    }

    // Opening date
    let opening_date: string | null = null;
    if (rawOpenDate) {
      opening_date = parseFlexibleDate(rawOpenDate);
      if (!opening_date) {
        issues.push('Date not parsed, will be left blank');
        if (status === 'valid') status = 'warning';
      }
    }

    // Tender board
    const tender_board = rawBoard ? cleanTextField(rawBoard) : null;

    // Expected delivery date
    let expected_delivery_date: string | null = null;
    if (rawDelivery) {
      expected_delivery_date = parseFlexibleDate(rawDelivery);
      if (!expected_delivery_date) {
        issues.push('Delivery date not parsed, will be left blank');
        if (status === 'valid') status = 'warning';
      }
    }

    // Notes
    const notes = rawNotes ? cleanTextField(rawNotes) : null;

    // ── Stage inference ──────────────────────────────────────────────
    const inferred = notes ? inferStatus(notes, defaultStage) : defaultStage;
    const stageAutoDetected = inferred !== defaultStage;

    // Map inferred to valid stage if possible
    let resolvedStage = defaultStage as string;
    if (inferred === 'awarded' && PROCUREMENT_STAGES.includes('awarded' as ProcurementStage)) {
      resolvedStage = 'awarded';
    } else if (inferred === 'cancelled') {
      resolvedStage = 'cancelled'; // handled as skip during import
    } else if (inferred === 'approved') {
      resolvedStage = 'no_objection';
    } else {
      resolvedStage = defaultStage;
    }

    validatedRows.push({
      rowIndex: i + 1,
      status,
      issues,
      resolvedStage,
      stageAutoDetected,
      fields: {
        title,
        description,
        bid_reference,
        estimated_value,
        procurement_method,
        opening_date,
        tender_board,
        expected_delivery_date,
        notes,
      },
    });

    counts[status]++;
  }

  return { rows: validatedRows, counts };
}
