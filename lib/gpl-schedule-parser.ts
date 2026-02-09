import * as XLSX from 'xlsx';

const CONFIG = {
  DATE_HEADER_ROW: 4,
  UNIT_START_ROW: 5,
  UNIT_END_ROW: 68,
  SUMMARY_START_ROW: 69,
  SUMMARY_END_ROW: 83,
  SUMMARY_ROWS: {
    TOTAL_FOSSIL: 69,
    EXPECTED_PEAK: 70,
    RESERVE_CAPACITY: 71,
    AVERAGE_FOR: 72,
    EXPECTED_CAPACITY: 73,
    EXPECTED_RESERVE: 74,
    SOLAR_HAMPSHIRE: 75,
    SOLAR_PROSPECT: 76,
    SOLAR_TRAFALGAR: 77,
    TOTAL_RENEWABLE: 78,
    TOTAL_DBIS: 79,
    EVENING_PEAK: 80,
    DAY_PEAK: 81,
    GEN_AVAILABILITY: 82,
    APPROX_SUPPRESSED: 83,
  },
  COLS: { STATION: 0, ENGINE: 1, UNIT_NUMBER: 2, MVA: 3, MW_INSTALLED: 4, MW_DERATED: 5, DATA_START: 6 },
  TIMEZONE_OFFSET: -4,
  STATIONS: [
    { name: 'SEI', startRow: 5, endRow: 7 },
    { name: 'Canefield', startRow: 8, endRow: 13 },
    { name: 'GOE', startRow: 24, endRow: 24 },
    { name: 'DP1', startRow: 25, endRow: 28 },
    { name: 'DP2', startRow: 29, endRow: 32 },
    { name: 'DP3', startRow: 33, endRow: 37 },
    { name: 'DP4', startRow: 38, endRow: 40 },
    { name: 'DP5', startRow: 41, endRow: 45 },
    { name: 'COL', startRow: 46, endRow: 62 },
    { name: 'Power Ship 1', startRow: 63, endRow: 64 },
    { name: 'Power Ship 2', startRow: 65, endRow: 68 },
  ],
};

export function getYesterdayGuyana(): string {
  const now = new Date();
  const guyanaTime = new Date(now.getTime() + CONFIG.TIMEZONE_OFFSET * 60 * 60 * 1000);
  guyanaTime.setUTCDate(guyanaTime.getUTCDate() - 1);
  return guyanaTime.toISOString().split('T')[0];
}

function parseExcelDate(value: any): string | null {
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
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
  }
  return null;
}

function normalizeEngine(engine: any): string | null {
  if (!engine) return null;
  const normalized = engine.toString().trim();
  if (normalized.toLowerCase().includes('wart')) return 'Wartsila';
  return normalized;
}

export function parsePeakDemandFormat(value: any): { onBars: number | null; suppressed: number | null } {
  if (!value || value === '-') return { onBars: null, suppressed: null };
  const str = String(value).trim();
  const match = str.match(/^([\d.]+)\s*\(([\d.]+)\)$/);
  if (match) return { onBars: parseFloat(match[1]), suppressed: parseFloat(match[2]) };
  const num = parseFloat(str);
  return !isNaN(num) ? { onBars: num, suppressed: null } : { onBars: null, suppressed: null };
}

function indexToCol(index: number): string {
  let col = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    col = String.fromCharCode(65 + remainder) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

interface DateColumnResult {
  error?: string;
  column?: number;
  columnLetter?: string;
  date?: string;
  exactMatch?: boolean;
  expectedDate?: string;
  scannedColumns?: number;
}

function findYesterdayColumn(sheetData: any[][]): DateColumnResult {
  const yesterday = getYesterdayGuyana();
  const dateRow = sheetData[CONFIG.DATE_HEADER_ROW - 1];
  if (!dateRow) return { error: 'Date header row (row 4) not found' };

  let yesterdayCol: number | null = null;
  let lastPopulatedCol: number | null = null;
  let lastPopulatedDate: string | null = null;
  let scannedCount = 0;

  for (let colIdx = CONFIG.COLS.DATA_START; colIdx < dateRow.length; colIdx++) {
    const cellValue = dateRow[colIdx];
    if (cellValue !== null && cellValue !== undefined) {
      const parsedDate = parseExcelDate(cellValue);
      if (parsedDate) {
        lastPopulatedCol = colIdx;
        lastPopulatedDate = parsedDate;
        scannedCount++;
        if (parsedDate === yesterday) { yesterdayCol = colIdx; break; }
      }
    }
  }

  if (yesterdayCol !== null) {
    return { column: yesterdayCol, columnLetter: indexToCol(yesterdayCol), date: yesterday, exactMatch: true, scannedColumns: scannedCount };
  }
  if (lastPopulatedCol !== null) {
    return { column: lastPopulatedCol, columnLetter: indexToCol(lastPopulatedCol), date: lastPopulatedDate!, exactMatch: false, expectedDate: yesterday, scannedColumns: scannedCount };
  }
  return { error: 'No date columns found in row 4' };
}

function forwardFillStations(sheetData: any[][]) {
  let currentStation: string | null = null;
  for (let rowIdx = CONFIG.UNIT_START_ROW - 1; rowIdx <= CONFIG.UNIT_END_ROW - 1; rowIdx++) {
    const row = sheetData[rowIdx];
    if (!row) continue;
    const stationCell = row[CONFIG.COLS.STATION];
    if (stationCell && String(stationCell).trim()) {
      currentStation = String(stationCell).trim();
    }
    (row as any)._filledStation = currentStation;
  }
}

export interface ScheduleUnit {
  rowNumber: number;
  station: string;
  engine: string | null;
  unitNumber: string | null;
  installedCapacityMva: number | null;
  installedCapacityMw: number | null;
  deratedCapacityMw: number | null;
  availableMw: number | null;
  status: 'online' | 'offline' | 'no_data';
  utilizationPct: number | null;
}

export interface StationAggregate {
  station: string;
  totalUnits: number;
  totalDeratedCapacityMw: number;
  totalAvailableMw: number;
  unitsOnline: number;
  unitsOffline: number;
  unitsNoData: number;
  stationUtilizationPct: number | null;
}

function parseUnits(sheetData: any[][], dataColIdx: number): ScheduleUnit[] {
  const units: ScheduleUnit[] = [];
  forwardFillStations(sheetData);

  for (let rowIdx = CONFIG.UNIT_START_ROW - 1; rowIdx <= CONFIG.UNIT_END_ROW - 1; rowIdx++) {
    const row = sheetData[rowIdx];
    if (!row) continue;

    const station = (row as any)._filledStation || row[CONFIG.COLS.STATION];
    if (!station) continue;

    const engine = normalizeEngine(row[CONFIG.COLS.ENGINE]);
    const unitNumber = row[CONFIG.COLS.UNIT_NUMBER];
    const installedMVA = parseFloat(row[CONFIG.COLS.MVA]) || null;
    const installedMW = parseFloat(row[CONFIG.COLS.MW_INSTALLED]) || null;
    const deratedMW = parseFloat(row[CONFIG.COLS.MW_DERATED]) || null;

    const availableRaw = row[dataColIdx];
    let availableMW: number | null = null;
    let status: 'online' | 'offline' | 'no_data' = 'no_data';

    if (availableRaw !== null && availableRaw !== undefined && availableRaw !== '') {
      availableMW = parseFloat(availableRaw);
      if (!isNaN(availableMW)) {
        status = availableMW > 0 ? 'online' : 'offline';
      } else {
        availableMW = null;
        status = 'no_data';
      }
    }

    let utilizationPct: number | null = null;
    if (availableMW !== null && deratedMW && deratedMW > 0) {
      utilizationPct = Math.round((availableMW / deratedMW) * 10000) / 100;
    }

    units.push({
      rowNumber: rowIdx + 1,
      station: String(station).trim(),
      engine,
      unitNumber: unitNumber !== null ? String(unitNumber) : null,
      installedCapacityMva: installedMVA,
      installedCapacityMw: installedMW,
      deratedCapacityMw: deratedMW,
      availableMw: availableMW,
      status,
      utilizationPct,
    });
  }
  return units;
}

function aggregateStations(units: ScheduleUnit[]): StationAggregate[] {
  const stations: Record<string, StationAggregate> = {};

  for (const unit of units) {
    const key = unit.station;
    if (!stations[key]) {
      stations[key] = {
        station: key, totalUnits: 0, totalDeratedCapacityMw: 0, totalAvailableMw: 0,
        unitsOnline: 0, unitsOffline: 0, unitsNoData: 0, stationUtilizationPct: null,
      };
    }
    const s = stations[key];
    s.totalUnits++;
    s.totalDeratedCapacityMw += unit.deratedCapacityMw || 0;
    if (unit.status === 'online') { s.unitsOnline++; s.totalAvailableMw += unit.availableMw || 0; }
    else if (unit.status === 'offline') { s.unitsOffline++; }
    else { s.unitsNoData++; }
  }

  for (const station of Object.values(stations)) {
    if (station.totalDeratedCapacityMw > 0) {
      station.stationUtilizationPct = Math.round((station.totalAvailableMw / station.totalDeratedCapacityMw) * 10000) / 100;
    }
    station.totalDeratedCapacityMw = Math.round(station.totalDeratedCapacityMw * 10000) / 10000;
    station.totalAvailableMw = Math.round(station.totalAvailableMw * 10000) / 10000;
  }
  return Object.values(stations);
}

function parseSummary(sheetData: any[][], dataColIdx: number) {
  const getValue = (rowNum: number): number | null => {
    const row = sheetData[rowNum - 1];
    if (!row) return null;
    const val = row[dataColIdx];
    if (val === null || val === undefined || val === '' || val === '-') return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  };

  const getStringValue = (rowNum: number) => {
    const row = sheetData[rowNum - 1];
    if (!row) return null;
    return row[dataColIdx];
  };

  const eveningPeak = parsePeakDemandFormat(getStringValue(CONFIG.SUMMARY_ROWS.EVENING_PEAK));
  const dayPeak = parsePeakDemandFormat(getStringValue(CONFIG.SUMMARY_ROWS.DAY_PEAK));

  const solarHampshire = getValue(CONFIG.SUMMARY_ROWS.SOLAR_HAMPSHIRE);
  const solarProspect = getValue(CONFIG.SUMMARY_ROWS.SOLAR_PROSPECT);
  const solarTrafalgar = getValue(CONFIG.SUMMARY_ROWS.SOLAR_TRAFALGAR);
  const totalRenewable = (solarHampshire || 0) + (solarProspect || 0) + (solarTrafalgar || 0);

  return {
    totalFossilFuelCapacityMw: getValue(CONFIG.SUMMARY_ROWS.TOTAL_FOSSIL),
    expectedPeakDemandMw: getValue(CONFIG.SUMMARY_ROWS.EXPECTED_PEAK),
    reserveCapacityMw: getValue(CONFIG.SUMMARY_ROWS.RESERVE_CAPACITY),
    averageFor: getValue(CONFIG.SUMMARY_ROWS.AVERAGE_FOR),
    expectedCapacityMw: getValue(CONFIG.SUMMARY_ROWS.EXPECTED_CAPACITY),
    expectedReserveMw: getValue(CONFIG.SUMMARY_ROWS.EXPECTED_RESERVE),
    solarHampshireMwp: solarHampshire,
    solarProspectMwp: solarProspect,
    solarTrafalgarMwp: solarTrafalgar,
    totalRenewableMwp: totalRenewable,
    totalDbisCapacityMw: getValue(CONFIG.SUMMARY_ROWS.TOTAL_DBIS),
    eveningPeakOnBarsMw: eveningPeak.onBars,
    eveningPeakSuppressedMw: eveningPeak.suppressed,
    dayPeakOnBarsMw: dayPeak.onBars,
    dayPeakSuppressedMw: dayPeak.suppressed,
    genAvailabilityAtSuppressedPeak: getValue(CONFIG.SUMMARY_ROWS.GEN_AVAILABILITY),
    approxSuppressedPeak: getValue(CONFIG.SUMMARY_ROWS.APPROX_SUPPRESSED),
  };
}

export function parseScheduleSheet(buffer: Buffer) {
  const startTime = Date.now();
  const warnings: any[] = [];

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: true, dense: false });
    const scheduleSheet = workbook.Sheets['Schedule'];
    if (!scheduleSheet) {
      return { success: false, error: 'Schedule sheet not found', availableSheets: workbook.SheetNames };
    }

    const sheetData = XLSX.utils.sheet_to_json(scheduleSheet, { header: 1, defval: null, raw: true }) as any[][];

    const dateResult = findYesterdayColumn(sheetData);
    if (dateResult.error) return { success: false, error: dateResult.error };

    if (!dateResult.exactMatch) {
      warnings.push({
        type: 'DATE_MISMATCH',
        message: `Expected ${dateResult.expectedDate} but found ${dateResult.date}`,
        detectedDate: dateResult.date,
        expectedDate: dateResult.expectedDate,
      });
    }

    const dataColIdx = dateResult.column!;
    const units = parseUnits(sheetData, dataColIdx);

    const onlineCount = units.filter(u => u.status === 'online').length;
    const offlineCount = units.filter(u => u.status === 'offline').length;
    const noDataCount = units.filter(u => u.status === 'no_data').length;

    if (noDataCount > units.length * 0.5) {
      warnings.push({ type: 'HIGH_NO_DATA', message: `${noDataCount} of ${units.length} units have no data (>50%)`, count: noDataCount, total: units.length });
    }

    const stations = aggregateStations(units);
    const summary = parseSummary(sheetData, dataColIdx);

    const totalAvailable = stations.reduce((sum, s) => sum + s.totalAvailableMw, 0);
    const totalDerated = stations.reduce((sum, s) => sum + s.totalDeratedCapacityMw, 0);
    const systemUtilizationPct = totalDerated > 0 ? Math.round((totalAvailable / totalDerated) * 10000) / 100 : null;
    const reserveMarginPct = summary.eveningPeakOnBarsMw && summary.eveningPeakOnBarsMw > 0
      ? Math.round(((totalAvailable - summary.eveningPeakOnBarsMw) / summary.eveningPeakOnBarsMw) * 10000) / 100
      : null;

    return {
      success: true,
      data: {
        date: dateResult.date,
        dateColumn: dateResult.columnLetter,
        exactDateMatch: dateResult.exactMatch,
        expectedDate: dateResult.expectedDate,
        units,
        stations,
        summary: { ...summary, systemUtilizationPct, reserveMarginPct },
        stats: {
          totalUnits: units.length,
          unitsOnline: onlineCount,
          unitsOffline: offlineCount,
          unitsNoData: noDataCount,
          totalStations: stations.length,
          totalAvailableMw: Math.round(totalAvailable * 100) / 100,
          totalDeratedMw: Math.round(totalDerated * 100) / 100,
          scannedColumns: dateResult.scannedColumns,
          processingTimeMs: Date.now() - startTime,
        },
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error: any) {
    return { success: false, error: `Failed to parse Schedule sheet: ${error.message}` };
  }
}

export { CONFIG };
