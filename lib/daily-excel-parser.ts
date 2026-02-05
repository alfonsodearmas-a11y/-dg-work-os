import * as XLSX from 'xlsx';

const CONFIG = {
  METADATA_COLUMNS: ['A', 'B', 'C', 'D', 'E', 'F'],
  DATA_START_COLUMN: 'G',
  HEADER_ROW: 4,
  DATA_START_ROW: 5,
  DATA_END_ROW: 83,
  TIMEZONE_OFFSET: -4,
  MAX_EMPTY_PERCENTAGE: 50,
};

function colToIndex(col: string): number {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}

function indexToCol(index: number): string {
  let col = '';
  index += 1;
  while (index > 0) {
    const remainder = (index - 1) % 26;
    col = String.fromCharCode(65 + remainder) + col;
    index = Math.floor((index - 1) / 26);
  }
  return col;
}

export function getYesterdayGuyana(): string {
  const now = new Date();
  const guyanaTime = new Date(now.getTime() + CONFIG.TIMEZONE_OFFSET * 60 * 60 * 1000);
  guyanaTime.setDate(guyanaTime.getDate() - 1);
  return guyanaTime.toISOString().split('T')[0];
}

export function parseExcelDate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString().split('T')[0];
  }
  if (typeof value === 'number' && value > 1 && value < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  return null;
}

function parseCellValue(cell: any) {
  if (!cell) return { raw: null, numeric: null, type: 'empty', error: null };
  if (cell.t === 'e') {
    const errorVal = cell.w || cell.v || 'ERROR';
    return { raw: errorVal, numeric: null, type: 'error', error: errorVal };
  }
  const value = cell.v;
  const formatted = cell.w;
  if (value === null || value === undefined || value === '') {
    return { raw: null, numeric: null, type: 'empty', error: null };
  }
  if (typeof value === 'number') {
    if (cell.t === 'n' && formatted && formatted.includes('%')) {
      return { raw: formatted, numeric: value * 100, type: 'percentage', error: null };
    }
    return { raw: value, numeric: value, type: 'number', error: null };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return { raw: null, numeric: null, type: 'empty', error: null };
    if (trimmed.endsWith('%')) {
      const numPart = parseFloat(trimmed.slice(0, -1));
      if (!isNaN(numPart)) return { raw: trimmed, numeric: numPart, type: 'percentage', error: null };
    }
    const currencyMatch = trimmed.match(/^\$?([\d,]+\.?\d*)$/);
    if (currencyMatch) {
      const numVal = parseFloat(currencyMatch[1].replace(/,/g, ''));
      if (!isNaN(numVal)) return { raw: trimmed, numeric: numVal, type: 'currency', error: null };
    }
    const numVal = parseFloat(trimmed.replace(/,/g, ''));
    if (!isNaN(numVal)) return { raw: trimmed, numeric: numVal, type: 'number', error: null };
    return { raw: trimmed, numeric: null, type: 'text', error: null };
  }
  if (typeof value === 'boolean') {
    return { raw: value.toString(), numeric: value ? 1 : 0, type: 'number', error: null };
  }
  return { raw: String(value), numeric: null, type: 'text', error: null };
}

function getCell(sheet: XLSX.WorkSheet, col: string, row: number) {
  return sheet[`${col}${row}`];
}

function getCellValue(sheet: XLSX.WorkSheet, col: string, row: number): any {
  const cell = getCell(sheet, col, row);
  return cell ? (cell.v !== undefined ? cell.v : cell.w) : null;
}

function findYesterdayColumn(sheet: XLSX.WorkSheet) {
  const yesterday = getYesterdayGuyana();
  const startColIndex = colToIndex(CONFIG.DATA_START_COLUMN);
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const maxCol = range.e.c;

  let yesterdayColumn: string | null = null;
  let lastPopulatedColumn: string | null = null;
  let lastPopulatedDate: string | null = null;
  let scannedCount = 0;

  for (let colIdx = startColIndex; colIdx <= maxCol; colIdx++) {
    const colLetter = indexToCol(colIdx);
    const cellValue = getCellValue(sheet, colLetter, CONFIG.HEADER_ROW);
    if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
      const parsedDate = parseExcelDate(cellValue);
      if (parsedDate) {
        lastPopulatedColumn = colLetter;
        lastPopulatedDate = parsedDate;
        scannedCount++;
        if (parsedDate === yesterday) {
          yesterdayColumn = colLetter;
        }
      }
    }
  }

  if (yesterdayColumn) {
    return { column: yesterdayColumn, date: yesterday, exactMatch: true, lastDataColumn: lastPopulatedColumn, lastDataDate: lastPopulatedDate, scannedColumns: scannedCount };
  }
  if (lastPopulatedColumn) {
    return { column: lastPopulatedColumn, date: lastPopulatedDate, exactMatch: false, lastDataColumn: lastPopulatedColumn, lastDataDate: lastPopulatedDate, scannedColumns: scannedCount, expectedDate: yesterday };
  }
  return { column: null, date: null, exactMatch: false, error: 'No date columns found in row 4', scannedColumns: 0 };
}

function extractMetadata(sheet: XLSX.WorkSheet) {
  const metadata: Record<string, any>[] = [];
  for (let row = CONFIG.DATA_START_ROW; row <= CONFIG.DATA_END_ROW; row++) {
    const rowMeta: Record<string, any> = {
      row,
      metric_name: getCellValue(sheet, 'A', row),
      category: getCellValue(sheet, 'B', row),
      subcategory: getCellValue(sheet, 'C', row),
      agency: getCellValue(sheet, 'D', row),
      unit: getCellValue(sheet, 'E', row),
      extra: getCellValue(sheet, 'F', row),
    };
    for (const key of Object.keys(rowMeta)) {
      if (typeof rowMeta[key] === 'string') rowMeta[key] = rowMeta[key].trim();
    }
    metadata.push(rowMeta);
  }
  return metadata;
}

function extractColumnData(sheet: XLSX.WorkSheet, column: string, metadata: Record<string, any>[]) {
  const records: any[] = [];
  let emptyCount = 0, errorCount = 0, numericCount = 0, textCount = 0;

  for (let i = 0; i < metadata.length; i++) {
    const row = CONFIG.DATA_START_ROW + i;
    const meta = metadata[i];
    const cell = getCell(sheet, column, row);
    const parsed = parseCellValue(cell);

    records.push({
      row,
      metric_name: meta.metric_name || `Row ${row}`,
      category: meta.category,
      subcategory: meta.subcategory,
      agency: meta.agency,
      unit: meta.unit,
      raw_value: parsed.raw,
      numeric_value: parsed.numeric,
      value_type: parsed.type,
      has_error: parsed.type === 'error',
      error_detail: parsed.error,
    });

    switch (parsed.type) {
      case 'empty': emptyCount++; break;
      case 'error': errorCount++; break;
      case 'text': textCount++; break;
      default: numericCount++; break;
    }
  }

  return {
    records,
    stats: { total: records.length, empty: emptyCount, errors: errorCount, numeric: numericCount, text: textCount, emptyPercentage: Math.round((emptyCount / records.length) * 100) },
  };
}

export function parseDailyExcel(buffer: Buffer, options: { sheetName?: string } = {}) {
  const startTime = Date.now();
  const warnings: any[] = [];

  try {
    if (!buffer || buffer.length === 0) return { success: false, error: 'Empty file buffer provided' };

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: true, cellFormula: false, sheetStubs: true, dense: false });
    const sheetName = options.sheetName || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) return { success: false, error: `Sheet not found: ${sheetName}`, availableSheets: workbook.SheetNames };

    const dateResult = findYesterdayColumn(sheet);
    if (!dateResult.column) return { success: false, error: dateResult.error || 'Could not find a valid date column', details: dateResult };

    if (!dateResult.exactMatch) {
      warnings.push({ type: 'DATE_MISMATCH', message: `Expected yesterday's date (${dateResult.expectedDate}) but found ${dateResult.date}`, detectedDate: dateResult.date, expectedDate: dateResult.expectedDate, column: dateResult.column });
    }

    const metadata = extractMetadata(sheet);
    const { records, stats } = extractColumnData(sheet, dateResult.column, metadata);

    if (stats.emptyPercentage > CONFIG.MAX_EMPTY_PERCENTAGE) {
      warnings.push({ type: 'HIGH_EMPTY_RATE', message: `${stats.emptyPercentage}% of values are empty`, emptyCount: stats.empty, totalCount: stats.total });
    }
    if (stats.errors > 0) {
      warnings.push({ type: 'EXCEL_ERRORS', message: `${stats.errors} cells contain Excel errors`, errorCount: stats.errors });
    }

    return {
      success: true,
      data: {
        date: dateResult.date,
        dateColumn: dateResult.column,
        exactDateMatch: dateResult.exactMatch,
        expectedDate: dateResult.expectedDate || dateResult.date,
        records,
        stats,
        metadata: { sheetName, totalSheets: workbook.SheetNames.length, scannedColumns: dateResult.scannedColumns, lastDataColumn: dateResult.lastDataColumn, lastDataDate: dateResult.lastDataDate, processingTimeMs: Date.now() - startTime },
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error: any) {
    return { success: false, error: `Failed to parse Excel file: ${error.message}` };
  }
}

export function validateExcelFile(file: { originalname: string; mimetype?: string; size: number }) {
  if (!file) return { valid: false, error: 'No file provided' };
  const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
  if (!['.xlsx', '.xls'].includes(ext)) return { valid: false, error: `Invalid file type: ${ext}. Only .xlsx and .xls files are allowed` };
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > 50) return { valid: false, error: `File too large: ${sizeMB.toFixed(1)}MB (maximum: 50MB)` };
  return { valid: true };
}

export { CONFIG };
