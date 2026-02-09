import * as XLSX from 'xlsx';

const COLS = {
  STATION: 0,
  ENGINE: 1,
  UNIT_NO: 2,
  INSTALLED_MVA: 3,
  DERATED_MW: 4,
  AVAILABLE_MW: 5,
  DISPATCHED_MW: 6,
  OUTAGE_REASON: 7,
  EXPECTED_DATE: 8,
  ACTUAL_DATE: 9,
  REMARKS: 10,
};

const CONFIG = {
  DATA_START_ROW: 5,
  DATA_END_ROW: 50,
  SUMMARY_INDICATORS: ['total', 'capacity', 'peak', 'demand', 'reserve', 'solar'],
};

function parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && value > 1 && value < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 86400000);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'n/a' || trimmed === '-') return null;
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizeStationName(name: any): string | null {
  if (!name) return null;
  const normalized = name.toString().trim();
  if (!normalized) return null;

  const stationMap: Record<string, string> = {
    'sei': 'SEI', 'skeldon': 'Skeldon', 'canefield': 'Canefield',
    'garden of eden': 'Garden of Eden', 'goe': 'GOE', 'versailles': 'Versailles',
    'vreed-en-hoop': 'Vreed-en-Hoop', 'vreed en hoop': 'Vreed-en-Hoop',
    'anna regina': 'Anna Regina', 'triumph': 'Triumph',
    'leguan': 'Leguan', 'wakenaam': 'Wakenaam', 'bartica': 'Bartica', 'linden': 'Linden',
    'col': 'COL', 'dp1': 'DP1', 'dp2': 'DP2', 'dp3': 'DP3', 'dp4': 'DP4', 'dp5': 'DP5',
    'power ship 1': 'Power Ship 1', 'power ship 2': 'Power Ship 2',
  };
  return stationMap[normalized.toLowerCase()] || normalized;
}

function isSummaryRow(row: any[]): boolean {
  if (!row) return true;
  const firstCell = row[0];
  if (!firstCell) return false;
  const text = firstCell.toString().toLowerCase();
  return CONFIG.SUMMARY_INDICATORS.some(ind => text.includes(ind));
}

function containsOutageText(text: any): boolean {
  if (!text) return false;
  const lower = text.toString().toLowerCase();
  return /maintenance|repair|outage|fault|breakdown|offline|down|out of service|not available/.test(lower);
}

export interface OutageRecord {
  station: string;
  engine: string | null;
  unitNumber: string | null;
  availableMw: number;
  dispatchedMw: number;
  reason: string | null;
  expectedCompletion: Date | null;
  actualCompletion: Date | null;
  remarks: string | null;
  isResolved: boolean;
  reportDate: string;
  matchedUnitRow?: number;
  scheduleDeratedMw?: number;
  scheduleAvailableMw?: number;
  scheduleStatus?: string;
}

export interface UnitRecord {
  rowNumber: number;
  station: string;
  engine: string | null;
  unitNumber: string | null;
  installedCapacityMva: number | null;
  deratedCapacityMw: number | null;
  availableMw: number;
  dispatchedMw: number;
  outageReason: string | null;
  expectedCompletion: Date | null;
  actualCompletion: Date | null;
  remarks: string | null;
  status: 'online' | 'offline';
  isOutage: boolean;
  reportDate: string;
}

export interface StatusParseResult {
  success: boolean;
  outages: OutageRecord[];
  allUnits: UnitRecord[];
  warnings: string[];
  error: string | null;
}

export function parseStatusSheet(workbook: XLSX.WorkBook, reportDate: string): StatusParseResult {
  const result: StatusParseResult = { success: false, outages: [], allUnits: [], warnings: [], error: null };

  try {
    const sheetNames = workbook.SheetNames;
    let sheetName: string | null = null;

    for (const name of ['Generation Status', 'Gen Status', 'Status']) {
      const found = sheetNames.find(s => s.toLowerCase().includes(name.toLowerCase()));
      if (found) { sheetName = found; break; }
    }

    if (!sheetName) {
      result.warnings.push('Generation Status sheet not found - no outage data will be extracted');
      result.success = true;
      return result;
    }

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as any[][];

    if (data.length < CONFIG.DATA_START_ROW) {
      result.warnings.push('Generation Status sheet has insufficient rows');
      result.success = true;
      return result;
    }

    let currentStation: string | null = null;

    for (let rowIdx = CONFIG.DATA_START_ROW - 1; rowIdx < Math.min(data.length, CONFIG.DATA_END_ROW); rowIdx++) {
      const row = data[rowIdx];
      if (!row || row.length === 0) continue;
      if (isSummaryRow(row)) continue;

      const stationCell = row[COLS.STATION];
      if (stationCell && stationCell.toString().trim()) {
        currentStation = normalizeStationName(stationCell);
      }
      if (!currentStation) continue;

      const engine = row[COLS.ENGINE] ? row[COLS.ENGINE].toString().trim() : null;
      const unitNo = row[COLS.UNIT_NO];
      const installedMva = parseFloat(row[COLS.INSTALLED_MVA]) || null;
      const deratedMw = parseFloat(row[COLS.DERATED_MW]) || null;
      const availableMw = parseFloat(row[COLS.AVAILABLE_MW]);
      const dispatchedMw = parseFloat(row[COLS.DISPATCHED_MW]);
      const outageReason = row[COLS.OUTAGE_REASON] ? row[COLS.OUTAGE_REASON].toString().trim() : null;
      const expectedDate = parseDate(row[COLS.EXPECTED_DATE]);
      const actualDate = parseDate(row[COLS.ACTUAL_DATE]);
      const remarks = row[COLS.REMARKS] ? row[COLS.REMARKS].toString().trim() : null;

      if (unitNo === null || unitNo === undefined) continue;

      const isOffline = availableMw === 0 || isNaN(availableMw);
      const hasOutageReason = !!outageReason && outageReason.length > 0;
      const hasOutageRemarks = containsOutageText(remarks);
      const isOutage = isOffline || hasOutageReason || hasOutageRemarks;

      const unitData: UnitRecord = {
        rowNumber: rowIdx + 1,
        station: currentStation,
        engine,
        unitNumber: unitNo !== null ? unitNo.toString() : null,
        installedCapacityMva: installedMva,
        deratedCapacityMw: deratedMw,
        availableMw: isNaN(availableMw) ? 0 : availableMw,
        dispatchedMw: isNaN(dispatchedMw) ? 0 : dispatchedMw,
        outageReason: outageReason || null,
        expectedCompletion: expectedDate,
        actualCompletion: actualDate,
        remarks: remarks || null,
        status: isOffline ? 'offline' : 'online',
        isOutage,
        reportDate,
      };

      result.allUnits.push(unitData);

      if (isOutage) {
        result.outages.push({
          station: currentStation,
          engine,
          unitNumber: unitNo !== null ? unitNo.toString() : null,
          availableMw: isNaN(availableMw) ? 0 : availableMw,
          dispatchedMw: isNaN(dispatchedMw) ? 0 : dispatchedMw,
          reason: outageReason || (hasOutageRemarks ? remarks : null),
          expectedCompletion: expectedDate,
          actualCompletion: actualDate,
          remarks,
          isResolved: actualDate !== null,
          reportDate,
        });
      }
    }

    result.success = true;
  } catch (error: any) {
    result.error = `Failed to parse Generation Status sheet: ${error.message}`;
    result.success = false;
  }

  return result;
}

export function matchOutagesToUnits(outages: OutageRecord[], scheduleUnits: UnitRecord[]): OutageRecord[] {
  return outages.map(outage => {
    const matchedUnit = scheduleUnits.find(unit => {
      const stationMatch = unit.station?.toLowerCase() === outage.station?.toLowerCase();
      const unitMatch = !outage.unitNumber || unit.unitNumber?.toString() === outage.unitNumber?.toString();
      return stationMatch && unitMatch;
    });

    if (matchedUnit) {
      return {
        ...outage,
        matchedUnitRow: matchedUnit.rowNumber,
        scheduleDeratedMw: matchedUnit.deratedCapacityMw ?? undefined,
        scheduleAvailableMw: matchedUnit.availableMw,
        scheduleStatus: matchedUnit.status,
      };
    }
    return outage;
  });
}

export { COLS, CONFIG };
