import * as XLSX from 'xlsx';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  sheetNames: string[];
  selectedSheet: string;
  rowCount: number;
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse an Excel or CSV file into structured rows keyed by header name.
 * If `sheetName` is provided and exists, that sheet is used; otherwise the first sheet.
 */
export function parseSpreadsheet(
  data: ArrayBuffer | Buffer,
  sheetName?: string,
): ParseResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });

  if (wb.SheetNames.length === 0) {
    throw new Error('Workbook contains no sheets');
  }

  const selected =
    sheetName && wb.SheetNames.includes(sheetName)
      ? sheetName
      : wb.SheetNames[0];

  const ws = wb.Sheets[selected];
  if (!ws) throw new Error(`Sheet "${selected}" not found`);

  // json with header: 1 gives an array of arrays (raw rows)
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (raw.length === 0) {
    return {
      headers: [],
      rows: [],
      sheetNames: wb.SheetNames,
      selectedSheet: selected,
      rowCount: 0,
    };
  }

  // Build header list preserving original indices so data columns stay aligned
  const rawHeaders = raw[0].map((h) => String(h ?? '').trim());
  const headerIndices: number[] = [];
  const headers: string[] = [];
  for (let i = 0; i < rawHeaders.length; i++) {
    if (rawHeaders[i]) {
      headers.push(rawHeaders[i]);
      headerIndices.push(i);
    }
  }

  const dataRows = raw.slice(1);

  const rows: Record<string, string>[] = [];
  for (const row of dataRows) {
    const record: Record<string, string> = {};
    let hasValue = false;
    for (let h = 0; h < headers.length; h++) {
      const cell = row[headerIndices[h]];
      const value =
        cell instanceof Date
          ? cell.toISOString().slice(0, 10)
          : String(cell ?? '').trim();
      record[headers[h]] = value;
      if (value) hasValue = true;
    }
    if (hasValue) rows.push(record);
  }

  return {
    headers,
    rows,
    sheetNames: wb.SheetNames,
    selectedSheet: selected,
    rowCount: rows.length,
  };
}
