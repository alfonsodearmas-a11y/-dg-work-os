import * as XLSX from 'xlsx';
import { cleanTextField } from './data-cleaner';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  sheetNames: string[];
  selectedSheet: string;
  rowCount: number;
}

// ── DOCX Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a .docx file containing a table into structured rows keyed by header name.
 * Uses mammoth to convert to HTML, then extracts tables via DOMParser.
 * If `tableName` matches one of the detected tables, that table is used;
 * otherwise the largest table (most rows) is selected.
 */
export async function parseDocx(
  data: ArrayBuffer,
  tableName?: string,
): Promise<ParseResult> {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ arrayBuffer: data });
  const html = result.value;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));

  if (tables.length === 0) {
    throw new Error(
      'No tables found in this document. The file must contain a table with procurement data.',
    );
  }

  // Build table labels with data-row counts (exclude header row)
  const tableNames = tables.map(
    (t, i) => `Table ${i + 1} (${Math.max(0, t.rows.length - 1)} rows)`,
  );

  // Select table by name or default to the largest
  let selectedIdx = 0;
  if (tableName) {
    const idx = tableNames.indexOf(tableName);
    if (idx >= 0) selectedIdx = idx;
  } else {
    let maxRows = 0;
    for (let i = 0; i < tables.length; i++) {
      if (tables[i].rows.length > maxRows) {
        maxRows = tables[i].rows.length;
        selectedIdx = i;
      }
    }
  }

  const table = tables[selectedIdx];
  const selected = tableNames[selectedIdx];

  if (table.rows.length === 0) {
    return { headers: [], rows: [], sheetNames: tableNames, selectedSheet: selected, rowCount: 0 };
  }

  // Build flat header positions, expanding colspan into empty slots
  const headerRow = table.rows[0];
  const rawHeaders: string[] = [];
  for (let i = 0; i < headerRow.cells.length; i++) {
    const cell = headerRow.cells[i];
    const text = cleanTextField(cell.textContent ?? '');
    rawHeaders.push(text);
    for (let c = 1; c < cell.colSpan; c++) rawHeaders.push('');
  }

  // Keep only non-empty headers and their column indices
  const headerIndices: number[] = [];
  const headers: string[] = [];
  for (let i = 0; i < rawHeaders.length; i++) {
    if (rawHeaders[i]) {
      headers.push(rawHeaders[i]);
      headerIndices.push(i);
    }
  }

  // Extract data rows
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < table.rows.length; r++) {
    const tr = table.rows[r];
    // Flatten cells accounting for colspan
    const cellValues: string[] = [];
    for (let c = 0; c < tr.cells.length; c++) {
      const cell = tr.cells[c];
      const text = cleanTextField(cell.textContent ?? '');
      cellValues.push(text);
      for (let x = 1; x < cell.colSpan; x++) cellValues.push('');
    }

    const record: Record<string, string> = {};
    let hasValue = false;
    for (let h = 0; h < headers.length; h++) {
      const value = cellValues[headerIndices[h]] ?? '';
      record[headers[h]] = value;
      if (value) hasValue = true;
    }
    if (hasValue) rows.push(record);
  }

  return { headers, rows, sheetNames: tableNames, selectedSheet: selected, rowCount: rows.length };
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
