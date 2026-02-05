import { parse } from 'csv-parse/sync';

export const KNOWN_KPIS = [
  'Affected Customers',
  'Collection Rate %',
  'HFO Generation Mix %',
  'LFO Generation Mix %',
  'Installed Capacity DBIS',
  'Installed Capacity Essequibo',
  'Peak Demand DBIS',
  'Peak Demand Essequibo',
];

function removeBOM(content: string): string {
  if (content.charCodeAt(0) === 0xFEFF) return content.slice(1);
  if (content.startsWith('\ufeff')) return content.slice(1);
  return content;
}

export function parseToFirstOfMonth(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const cleaned = dateStr.toString().trim();
    const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return new Date(Date.UTC(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, 1));
    }
    const usMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (usMatch) {
      return new Date(Date.UTC(parseInt(usMatch[3]), parseInt(usMatch[1]) - 1, 1));
    }
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), 1));
    }
    return null;
  } catch {
    return null;
  }
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0];
}

export function normalizeValue(kpiName: string, rawValue: any): { value: number | null; raw: string } {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { value: null, raw: String(rawValue ?? '') };
  }
  const strValue = rawValue.toString().trim();
  let numValue = parseFloat(strValue.replace(/,/g, ''));
  if (isNaN(numValue)) {
    return { value: null, raw: strValue };
  }
  if (kpiName === 'Collection Rate %' && numValue < 1.5) {
    numValue = numValue * 100;
  }
  return { value: numValue, raw: strValue };
}

export interface KpiRow {
  reportMonth: string | null;
  kpiName: string;
  value: number | null;
  rawValue: string;
}

export interface KpiParseResult {
  success: boolean;
  filename: string;
  preview: {
    filename: string;
    totalRows: number;
    dateRange: { start: string | null; end: string | null };
    monthsCount: number;
    kpisFound: string[];
    knownKpisCount: number;
    latestMonth: string | null;
    latestSnapshot: Record<string, number | null>;
  } | null;
  data: KpiRow[];
  warnings: string[];
  error: string | null;
}

export function parseKpiCsv(content: string | Buffer, filename = 'unknown.csv'): KpiParseResult {
  const result: KpiParseResult = {
    success: false,
    filename,
    preview: null,
    data: [],
    warnings: [],
    error: null,
  };

  try {
    let csvContent = Buffer.isBuffer(content) ? content.toString('utf8') : content;
    csvContent = removeBOM(csvContent);

    const records: Record<string, string>[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    if (records.length === 0) {
      result.error = 'CSV file is empty or has no data rows';
      return result;
    }

    const columns = Object.keys(records[0]);
    const dateCol = columns.find(c => c.toLowerCase().includes('date'));
    const kpiCol = columns.find(c => c.toLowerCase() === 'kpi' || c.toLowerCase().includes('kpi'));
    const valueCol = columns.find(c =>
      c.toLowerCase().includes('actual') || c.toLowerCase().includes('value') || c.toLowerCase() === 'sum of actual'
    );

    if (!dateCol) { result.error = 'Could not find Date column in CSV'; return result; }
    if (!kpiCol) { result.error = 'Could not find KPI column in CSV'; return result; }
    if (!valueCol) { result.error = 'Could not find Value/Actual column in CSV'; return result; }

    const parsedRows: KpiRow[] = [];
    const kpisFound = new Set<string>();
    const monthsFound = new Set<string>();
    const unknownKpis = new Set<string>();
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2;

      const monthDate = parseToFirstOfMonth(row[dateCol]);
      if (!monthDate) { result.warnings.push(`Row ${rowNum}: Invalid date "${row[dateCol]}"`); continue; }

      const kpiName = row[kpiCol]?.trim();
      if (!kpiName) { result.warnings.push(`Row ${rowNum}: Missing KPI name`); continue; }

      if (!KNOWN_KPIS.includes(kpiName)) unknownKpis.add(kpiName);

      const { value, raw } = normalizeValue(kpiName, row[valueCol]);
      kpisFound.add(kpiName);
      const monthStr = formatDate(monthDate);
      if (monthStr) monthsFound.add(monthStr);

      if (!minDate || monthDate < minDate) minDate = monthDate;
      if (!maxDate || monthDate > maxDate) maxDate = monthDate;

      parsedRows.push({ reportMonth: formatDate(monthDate), kpiName, value, rawValue: raw });
    }

    if (unknownKpis.size > 0) {
      result.warnings.push(`Unknown KPI(s) found: ${Array.from(unknownKpis).join(', ')}`);
    }

    const latestMonth = formatDate(maxDate);
    const latestSnapshot: Record<string, number | null> = {};
    parsedRows.filter(r => r.reportMonth === latestMonth).forEach(r => { latestSnapshot[r.kpiName] = r.value; });

    result.success = true;
    result.data = parsedRows;
    result.preview = {
      filename,
      totalRows: parsedRows.length,
      dateRange: { start: formatDate(minDate), end: formatDate(maxDate) },
      monthsCount: monthsFound.size,
      kpisFound: Array.from(kpisFound).sort(),
      knownKpisCount: Array.from(kpisFound).filter(k => KNOWN_KPIS.includes(k)).length,
      latestMonth,
      latestSnapshot,
    };
  } catch (err: any) {
    result.error = `Failed to parse CSV: ${err.message}`;
  }

  return result;
}

export function formatForAnalysis(data: KpiRow[]) {
  const byMonth: Record<string, Record<string, number | null>> = {};
  data.forEach(row => {
    if (!row.reportMonth) return;
    if (!byMonth[row.reportMonth]) byMonth[row.reportMonth] = {};
    byMonth[row.reportMonth][row.kpiName] = row.value;
  });

  const sortedMonths = Object.keys(byMonth).sort();
  let text = 'Monthly KPI Data:\n\n';
  sortedMonths.forEach(month => {
    text += `${month}:\n`;
    Object.entries(byMonth[month]).forEach(([kpi, value]) => {
      if (value !== null) text += `  - ${kpi}: ${value}\n`;
    });
    text += '\n';
  });

  return {
    text,
    byMonth,
    sortedMonths,
    dateRange: { start: sortedMonths[0], end: sortedMonths[sortedMonths.length - 1] },
  };
}
