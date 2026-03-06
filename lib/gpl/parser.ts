// GPL Service Connection Parser v2
// Ground-up rebuild. Handles multi-sheet Excel files with embedded historical snapshots.

import * as XLSX from 'xlsx';
import type {
  Track, Stage, Category,
  GPLOutstandingRecord, GPLCompletedRecord,
  GPLParsedSheet, GPLDataWarning, GPLParseResult,
} from './types';

// ── Month Name Mapping ──────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

// ── Date Helpers ────────────────────────────────────────────────────────────

function excelSerialToDate(serial: number): Date {
  // Use UTC to avoid timezone shifts that push dates to adjacent days.
  // Excel serial 1 = 1900-01-01. The epoch is 1899-12-30 (accounting for the Lotus 1-2-3 bug).
  // Math.floor strips the time fraction (e.g., 46083.66 → 46083) to get the date-only serial.
  // Math.round would incorrectly push afternoon times to the next day.
  const utcEpoch = Date.UTC(1899, 11, 30);
  const ms = utcEpoch + Math.floor(serial) * 86400000;
  const d = new Date(ms);
  // Return as a local date at midnight (year/month/day from UTC)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseExcelDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    if (raw < 1 || raw > 100000) return null;
    const d = excelSerialToDate(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string') {
    // Try parsing, but strip to date-only to avoid timezone issues
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
  }
  return null;
}

function daysBetween(start: Date, end: Date): number {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ── Sheet Date Extraction ───────────────────────────────────────────────────

interface SheetDateInfo {
  sheetName: string;
  date: Date;
  day: number;
  month: number;
}

function extractDateFromSheetName(sheetName: string): Date | null {
  const today = new Date();
  const currentYear = today.getFullYear();

  // Extract ALL month+day pairs from the sheet name, take the LATEST one.
  // This handles: "Feb28-Mar 5" (range), "March 5" (single), "Feb 28-" (truncated range)
  const allDates: Date[] = [];
  const pattern = /([A-Za-z]{3,})\s*(\d{1,2})/g;
  let match;

  while ((match = pattern.exec(sheetName)) !== null) {
    const monthStr = match[1].toLowerCase();
    const day = parseInt(match[2]);

    // Skip non-month words that happen to precede numbers (e.g., "days 26", "Works 26")
    const month = MONTH_NAMES[monthStr];
    if (month === undefined) continue;
    if (day < 1 || day > 31) continue;

    let year = currentYear;
    const candidate = new Date(year, month, day);
    if (candidate.getTime() > today.getTime() + 60 * 86400000) year--;
    allDates.push(new Date(year, month, day));
  }

  if (allDates.length === 0) return null;

  // Return the latest date found
  return allDates.reduce((max, d) => d.getTime() > max.getTime() ? d : max, allDates[0]);
}

// ── Sheet Classification ────────────────────────────────────────────────────

interface SheetClassification {
  track: Track;
  stage: Stage;
  category: Category;
}

function classifySheet(sheetName: string): SheetClassification | null {
  const lower = sheetName.toLowerCase();

  // Skip summary sheet
  if (/^summary$/i.test(sheetName.trim())) return null;

  // Determine category
  const isCompleted = /completed/i.test(lower);
  const category: Category = isCompleted ? 'completed' : 'outstanding';

  // Track A: "3 day" or metering-related
  if (/3\s*day/i.test(lower) || /metering/i.test(lower)) {
    return { track: 'A', stage: 'metering', category };
  }

  // Track B Design: "estimate" or "design"
  if (/estimat/i.test(lower) || /design/i.test(lower)) {
    return { track: 'B', stage: 'design', category };
  }

  // Track B Execution: "cap work" or "26 day"
  if (/cap\s*work/i.test(lower) || /26\s*day/i.test(lower)) {
    return { track: 'B', stage: 'execution', category };
  }

  return null;
}

// ── Dynamic Header Detection ────────────────────────────────────────────────

const HEADER_KEYWORDS = [
  'NO', 'CUSTOMER', 'NAME', 'ADDRESS', 'SERVICE', 'DATE',
  'ACCOUNT', 'STATUS', 'TYPE', 'CYCLE', 'DIVISION', 'ORDER', 'TOWN',
];

function findHeaderRow(data: unknown[][]): number {
  for (let i = 0; i < Math.min(data.length, 15); i++) {
    const row = data[i];
    if (!row) continue;
    const cells = row.map(c => String(c ?? '').trim().toUpperCase());
    const nonEmpty = cells.filter(c => c !== '').length;
    if (nonEmpty < 4) continue;
    const hits = HEADER_KEYWORDS.filter(kw => cells.some(c => c.includes(kw))).length;
    if (hits >= 2) return i;
  }
  return -1;
}

// ── Column Mapping ──────────────────────────────────────────────────────────

function mapColumns(headers: string[]) {
  const find = (...candidates: string[]): number => {
    for (const c of candidates) {
      const idx = headers.findIndex(h => h.includes(c));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  return {
    rowNum: find('NO.', 'NO'),
    customerNum: find('CUSTOMER #', 'CUSTOMER NO', 'CUSTOMER NUMBER'),
    accountNum: find('ACCOUNT #', 'ACCOUNT NO', 'ACCOUNT NUMBER'),
    name: find('NAME'),
    serviceAddress: find('SERVICE ADDRESS', 'ADDRESS'),
    townCity: find('TOWN', 'CITY'),
    accountStatus: find('ACCOUNT STATUS', 'STATUS'),
    cycle: find('CYCLE'),
    accountType: find('ACCOUNT TYPE', 'ACCT TYPE'),
    divisionCode: find('DIVISION', 'DIV'),
    serviceOrderNum: find('SERVICE ORDER', 'SO NO', 'SO NUMBER', 'ORDER NO', 'ORDER #'),
    serviceType: find('TYPE OF SERVICE', 'SERVICE ORDER TYPE', 'SO TYPE'),
    dateCreated: find('DATE/TIME CREATED', 'DATE CREATED', 'DATE/TIME', 'DATE APPLICATION'),
    currentDate: find('CURRENT DATE'),
    timeElapsed: find('TIME ELAPSED', 'DAYS ELAPSED', 'ELAPSED'),
    dateCompleted: find('DATE WORK COMPLETED', 'DATE COMPLETED', 'COMPLETION'),
    daysTaken: find('DAYS TAKEN', 'DAYS'),
    createdBy: find('CREATED BY', 'COMPLETED BY', 'TECHNICIAN'),
  };
}

// ── Row Validation ──────────────────────────────────────────────────────────

function isDataRow(row: unknown[]): boolean {
  const nonEmpty = row.filter(c => c != null && c !== '').length;
  return nonEmpty >= 3;
}

// ── Cell Value Extraction ───────────────────────────────────────────────────

function cellStr(row: unknown[], idx: number): string | null {
  if (idx < 0 || idx >= row.length) return null;
  const v = row[idx];
  if (v == null || v === '') return null;
  return String(v).trim();
}

function cellInt(row: unknown[], idx: number): number | null {
  if (idx < 0 || idx >= row.length) return null;
  const v = row[idx];
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v));
  return isNaN(n) ? null : Math.round(n);
}

// ── Summary Sheet Reader ────────────────────────────────────────────────────

function readSummarySheet(wb: XLSX.WorkBook): Record<string, number> {
  const summaryName = wb.SheetNames.find(n => /^summary$/i.test(n.trim()));
  if (!summaryName) return {};

  const sheet = wb.Sheets[summaryName];
  const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const expected: Record<string, number> = {};

  for (const row of data) {
    if (!row || row.length < 2) continue;
    const label = String(row[0] ?? '').trim();
    const value = typeof row[1] === 'number' ? row[1] : parseInt(String(row[1] ?? ''));
    if (label && !isNaN(value)) {
      expected[label] = value;
    }
  }

  return expected;
}

// ── Main Parser ─────────────────────────────────────────────────────────────

export function parseGPLExcel(buffer: Buffer, fileName: string): GPLParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const warnings: GPLDataWarning[] = [];

  // Step 1: Extract dates from all sheet names, find the latest
  const sheetDates: SheetDateInfo[] = [];
  for (const sheetName of wb.SheetNames) {
    if (/^summary$/i.test(sheetName.trim())) continue;
    const date = extractDateFromSheetName(sheetName);
    if (date) {
      sheetDates.push({
        sheetName,
        date,
        day: date.getDate(),
        month: date.getMonth(),
      });
    }
  }

  if (sheetDates.length === 0) {
    throw new Error('No sheets with recognizable dates found in the Excel file');
  }

  // Find the maximum date
  const maxDate = sheetDates.reduce((max, s) =>
    s.date.getTime() > max.getTime() ? s.date : max,
    sheetDates[0].date,
  );
  const snapshotDate = maxDate;

  // Step 2: Only process sheets matching the latest date.
  // Also include sheets with truncated range endings (e.g., "Feb 28-" or "Feb 28- Ma ")
  // where the end date was cut off by Excel's 31-char sheet name limit.
  const latestSheetNames = new Set<string>();

  for (const s of sheetDates) {
    if (s.date.getTime() === maxDate.getTime()) {
      latestSheetNames.add(s.sheetName);
    } else if (/[-–]\s*[A-Za-z]{0,2}\s*$/.test(s.sheetName.trim())) {
      // Truncated range ending: "Feb 28-" or "Feb 28- Ma "
      latestSheetNames.add(s.sheetName);
    } else if (/\bto\s*[A-Za-z]{0,2}\s*$/.test(s.sheetName.trim())) {
      // Truncated range with "to": "Feb28 to " or "Feb28 toM"
      latestSheetNames.add(s.sheetName);
    }
  }

  // Also include sheets with no extractable date that:
  // 1. Can be classified (have track/stage/category), AND
  // 2. Contain a month name matching the snapshot month (truncated names like "March " without day)
  const snapshotMonthNames = Object.entries(MONTH_NAMES)
    .filter(([, m]) => m === maxDate.getMonth())
    .map(([name]) => name);

  for (const sheetName of wb.SheetNames) {
    if (/^summary$/i.test(sheetName.trim())) continue;
    if (latestSheetNames.has(sheetName)) continue;
    // Skip if this sheet already has an extracted date that didn't match
    if (sheetDates.some(s => s.sheetName === sheetName)) continue;
    // Check if it contains the snapshot month and can be classified
    const lower = sheetName.toLowerCase();
    const hasSnapshotMonth = snapshotMonthNames.some(m => lower.includes(m));
    if (hasSnapshotMonth && classifySheet(sheetName)) {
      latestSheetNames.add(sheetName);
    }
  }

  const latestSheets = [...latestSheetNames].map(name => ({
    sheetName: name,
    date: sheetDates.find(s => s.sheetName === name)?.date ?? maxDate,
  }));

  // Step 3: Read summary sheet for validation
  const summaryExpected = readSummarySheet(wb);

  // Step 4: Parse each qualifying sheet
  const parsedSheets: GPLParsedSheet[] = [];
  const actualCounts: Record<string, number> = {};

  for (const { sheetName } of latestSheets) {
    const classification = classifySheet(sheetName);
    if (!classification) {
      warnings.push({
        type: 'missing_field',
        severity: 'warning',
        message: `Sheet "${sheetName}" could not be classified (skipped)`,
      });
      continue;
    }

    const { track, stage, category } = classification;
    const sheet = wb.Sheets[sheetName];
    const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const headerIdx = findHeaderRow(data);
    if (headerIdx === -1) {
      warnings.push({
        type: 'missing_field',
        severity: 'warning',
        message: `No header row found in sheet "${sheetName}"`,
      });
      continue;
    }

    const headers = (data[headerIdx] as unknown[]).map(c =>
      String(c ?? '').trim().toUpperCase()
    );
    const cols = mapColumns(headers);

    // Within-sheet dedup tracking
    const seenKeys = new Set<string>();

    if (category === 'completed') {
      const records: GPLCompletedRecord[] = [];

      for (let i = headerIdx + 1; i < data.length; i++) {
        const row = data[i] as unknown[];
        if (!row || !isDataRow(row)) continue;

        const accountNumber = cellStr(row, cols.accountNum);
        const customerNumber = cellStr(row, cols.customerNum);
        const name = cellStr(row, cols.name);

        // Must have at least account/customer number or name
        if (!accountNumber && !customerNumber && !name) continue;

        const serviceOrderNumber = cellStr(row, cols.serviceOrderNum);

        // Within-sheet dedup
        const dedupKey = `${accountNumber || ''}:${serviceOrderNumber || ''}`;
        if (dedupKey !== ':' && seenKeys.has(dedupKey)) {
          warnings.push({
            type: 'duplicate_within_sheet',
            severity: 'warning',
            message: `Duplicate in "${sheetName}": account=${accountNumber}, SO=${serviceOrderNumber}`,
            details: { sheetName, accountNumber, serviceOrderNumber },
          });
          continue;
        }
        if (dedupKey !== ':') seenKeys.add(dedupKey);

        const dateCreated = parseExcelDate(cols.dateCreated >= 0 ? row[cols.dateCreated] : null);
        const dateCompleted = parseExcelDate(cols.dateCompleted >= 0 ? row[cols.dateCompleted] : null);
        const reportedDaysTaken = cellInt(row, cols.daysTaken);
        const createdBy = cellStr(row, cols.createdBy);

        let daysTakenCalculated: number | null = null;
        let isError = false;
        let qualityNote: string | null = null;

        if (dateCreated && dateCompleted) {
          const diff = daysBetween(dateCreated, dateCompleted);

          if (diff >= 0) {
            // Normal case: completed on or after created
            daysTakenCalculated = diff;
          } else {
            // Completed date is before created date — three-tier handling
            const gap = -diff; // positive number of days before

            if (gap <= 2) {
              // Category A (gap=0 shouldn't happen after floor, but just in case) or
              // Category B (1-2 days): backdated entry — work done before SO# entered
              daysTakenCalculated = 0;
              isError = false;
              qualityNote = gap === 0
                ? 'Same-day completion (timestamp ordering)'
                : `Work completed ${gap} day${gap > 1 ? 's' : ''} before service order entered in system`;
              warnings.push({
                type: gap === 0 ? 'same_day_completion' : 'backdated_entry',
                severity: 'info',
                message: `${qualityNote} — account ${accountNumber}`,
                details: { sheetName, accountNumber, dateCreated: formatDateISO(dateCreated), dateCompleted: formatDateISO(dateCompleted), gap },
              });
            } else {
              // Category C (3+ days): genuine data entry error
              isError = true;
              qualityNote = `Completion date ${formatDateISO(dateCompleted)} is ${gap} days before creation date ${formatDateISO(dateCreated)} — likely data entry error`;
              daysTakenCalculated = null;
              warnings.push({
                type: 'reversed_date',
                severity: 'error',
                message: qualityNote,
                details: { sheetName, accountNumber, dateCreated: formatDateISO(dateCreated), dateCompleted: formatDateISO(dateCompleted), gap },
              });
            }
          }
        }

        records.push({
          row_number: records.length + 1,
          customer_number: customerNumber,
          account_number: accountNumber,
          customer_name: name,
          service_address: cellStr(row, cols.serviceAddress),
          town_city: cellStr(row, cols.townCity),
          account_status: cellStr(row, cols.accountStatus),
          cycle: cellStr(row, cols.cycle),
          account_type: cellStr(row, cols.accountType),
          service_order_number: serviceOrderNumber,
          service_type: cellStr(row, cols.serviceType),
          date_created: dateCreated,
          date_completed: dateCompleted,
          created_by: createdBy,
          days_taken: reportedDaysTaken,
          days_taken_calculated: daysTakenCalculated,
          is_data_quality_error: isError,
          data_quality_note: qualityNote,
        });
      }

      const key = `${track}:${stage}:${category}`;
      actualCounts[key] = records.length;

      parsedSheets.push({
        sheetName,
        track,
        stage,
        category,
        records,
        recordCount: records.length,
      });
    } else {
      // Outstanding records
      const records: GPLOutstandingRecord[] = [];

      for (let i = headerIdx + 1; i < data.length; i++) {
        const row = data[i] as unknown[];
        if (!row || !isDataRow(row)) continue;

        const accountNumber = cellStr(row, cols.accountNum);
        const customerNumber = cellStr(row, cols.customerNum);
        const name = cellStr(row, cols.name);

        if (!accountNumber && !customerNumber && !name) continue;

        const serviceOrderNumber = cellStr(row, cols.serviceOrderNum);

        // Within-sheet dedup
        const dedupKey = `${accountNumber || ''}:${serviceOrderNumber || ''}`;
        if (dedupKey !== ':' && seenKeys.has(dedupKey)) {
          warnings.push({
            type: 'duplicate_within_sheet',
            severity: 'warning',
            message: `Duplicate in "${sheetName}": account=${accountNumber}, SO=${serviceOrderNumber}`,
            details: { sheetName, accountNumber, serviceOrderNumber },
          });
          continue;
        }
        if (dedupKey !== ':') seenKeys.add(dedupKey);

        const dateCreated = parseExcelDate(cols.dateCreated >= 0 ? row[cols.dateCreated] : null);
        const currentDateRef = parseExcelDate(cols.currentDate >= 0 ? row[cols.currentDate] : null);
        const reportedElapsed = cellInt(row, cols.timeElapsed);

        let calculatedElapsed: number | null = null;
        if (dateCreated) {
          const endDate = currentDateRef || snapshotDate;
          calculatedElapsed = daysBetween(dateCreated, endDate);
          if (calculatedElapsed < 0) calculatedElapsed = 0;
        }

        records.push({
          row_number: records.length + 1,
          customer_number: customerNumber,
          account_number: accountNumber,
          customer_name: name,
          service_address: cellStr(row, cols.serviceAddress),
          town_city: cellStr(row, cols.townCity),
          account_status: cellStr(row, cols.accountStatus),
          cycle: cellStr(row, cols.cycle),
          account_type: cellStr(row, cols.accountType),
          division_code: cellStr(row, cols.divisionCode),
          service_order_number: serviceOrderNumber,
          service_type: cellStr(row, cols.serviceType),
          date_created: dateCreated,
          current_date_ref: currentDateRef,
          days_elapsed: reportedElapsed,
          days_elapsed_calculated: calculatedElapsed,
        });
      }

      const key = `${track}:${stage}:${category}`;
      actualCounts[key] = records.length;

      parsedSheets.push({
        sheetName,
        track,
        stage,
        category,
        records,
        recordCount: records.length,
      });
    }
  }

  // Step 5: Deduplicate sheets with the same classification.
  // Files may contain embedded historical snapshots. When multiple sheets map to the
  // same (track, stage, category), prefer the one whose extracted date matches the
  // snapshot date. If tied, keep the first one encountered.
  const sheetDateMap = new Map<string, Date>();
  for (const sd of sheetDates) {
    sheetDateMap.set(sd.sheetName, sd.date);
  }

  const classificationMap = new Map<string, number>();
  for (let i = 0; i < parsedSheets.length; i++) {
    const s = parsedSheets[i];
    const key = `${s.track}:${s.stage}:${s.category}`;
    const existingIdx = classificationMap.get(key);
    if (existingIdx !== undefined) {
      const existing = parsedSheets[existingIdx];
      // Prefer the sheet with a date matching the snapshot date
      const sDate = sheetDateMap.get(s.sheetName);
      const existingDate = sheetDateMap.get(existing.sheetName);
      const sMatchesSnapshot = sDate && sDate.getTime() === maxDate.getTime();
      const existingMatchesSnapshot = existingDate && existingDate.getTime() === maxDate.getTime();

      let keepNew = false;
      if (sMatchesSnapshot && !existingMatchesSnapshot) {
        keepNew = true;
      } else if (!sMatchesSnapshot && existingMatchesSnapshot) {
        keepNew = false;
      }
      // If both match or neither matches, keep existing (first encountered)

      if (keepNew) {
        warnings.push({
          type: 'reclassification',
          severity: 'info',
          message: `Duplicate classification ${key}: keeping "${s.sheetName}" (${s.recordCount}) over "${existing.sheetName}" (${existing.recordCount})`,
        });
        parsedSheets[existingIdx] = s;
      } else {
        warnings.push({
          type: 'reclassification',
          severity: 'info',
          message: `Duplicate classification ${key}: keeping "${existing.sheetName}" (${existing.recordCount}) over "${s.sheetName}" (${s.recordCount})`,
        });
      }
      parsedSheets.splice(i, 1);
      i--;
    } else {
      classificationMap.set(key, i);
    }
  }

  // Rebuild actual counts after dedup
  for (const s of parsedSheets) {
    actualCounts[`${s.track}:${s.stage}:${s.category}`] = s.recordCount;
  }

  // Step 6: Summary validation
  const mismatches: string[] = [];
  for (const [label, expected] of Object.entries(summaryExpected)) {
    // Try to match summary labels to our keys
    for (const [key, actual] of Object.entries(actualCounts)) {
      const lower = label.toLowerCase();
      const [track, stage, cat] = key.split(':');
      const matches = lower.includes(stage) && lower.includes(cat);
      if (matches && actual !== expected) {
        const msg = `Summary mismatch: "${label}" expected ${expected}, got ${actual}`;
        mismatches.push(msg);
        warnings.push({
          type: 'summary_mismatch',
          severity: 'warning',
          message: msg,
          details: { label, expected, actual },
        });
      }
    }
  }

  return {
    snapshotDate,
    fileName,
    sheets: parsedSheets,
    summaryValidation: {
      expected: summaryExpected,
      actual: actualCounts,
      mismatches,
    },
    warnings,
  };
}
