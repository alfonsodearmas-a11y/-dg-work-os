import * as XLSX from 'xlsx';
import { safeParseFloat } from '@/lib/parse-utils';
import type { GPLStationData, GPLUnitDetail, GPLParseSummaries } from '@/lib/types/gpl';

interface ParseResult {
  success: boolean;
  error?: string;
  data?: {
    reportDate: string | null;
    stationData: Record<string, GPLStationData>;
    summaries: GPLParseSummaries;
    apiPayload: {
      reportDate: string | null;
      stationData: Record<string, { units: number; derated_mw: number; available_mw: number }>;
      generationAvailability: number;
      hampshireSolarMwp: number;
      prospectSolarMwp: number;
      trafalgarSolarMwp: number;
    };
    meta: {
      sheetName: string;
      stationCount: number;
      totalUnits: number;
      calculatedTotalMW: number;
      totalSolarMwp: number;
      totalDBISCapacity: number;
    };
  };
}

export function parseGPLExcel(buffer: Buffer): ParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    const genStatusSheet = workbook.Sheets['Generation Status'];
    const scheduleSheet = workbook.Sheets['Schedule'];

    if (!genStatusSheet) {
      return { success: false, error: 'Generation Status sheet not found' };
    }

    const genData = XLSX.utils.sheet_to_json(genStatusSheet, { header: 1, defval: null }) as unknown[][];
    const schedData = scheduleSheet
      ? (XLSX.utils.sheet_to_json(scheduleSheet, { header: 1, defval: null }) as unknown[][])
      : null;

    const stationData: Record<string, GPLStationData> = {};
    let currentStation: string | null = null;

    // Parse Generation Status sheet (rows 4-40)
    for (let i = 4; i <= 40; i++) {
      const row = genData[i];
      if (!row) continue;

      const stationCell = row[0];
      if (stationCell && typeof stationCell === 'string' && stationCell.trim()) {
        currentStation = stationCell.trim();
      }

      if (!currentStation) continue;
      if (currentStation.toLowerCase().includes('total') ||
          currentStation.toLowerCase().includes('exp.') ||
          currentStation.toLowerCase().includes('reserve')) {
        continue;
      }

      const unitNo = row[2] as string | number | null;
      const installedMVA = safeParseFloat(row[3]);
      const deratedMW = safeParseFloat(row[4]);
      const availableMW = safeParseFloat(row[5]);

      if (unitNo !== null && unitNo !== undefined && unitNo !== '') {
        if (!stationData[currentStation]) {
          stationData[currentStation] = { units: 0, installed_mva: 0, derated_mw: 0, available_mw: 0, unit_details: [] };
        }

        stationData[currentStation].units += 1;
        stationData[currentStation].installed_mva += installedMVA;
        stationData[currentStation].derated_mw += deratedMW;
        stationData[currentStation].available_mw += availableMW;
        stationData[currentStation].unit_details.push({
          unit: unitNo as GPLUnitDetail['unit'],
          installed_mva: installedMVA,
          derated_mw: deratedMW,
          available_mw: availableMW,
        });
      }
    }

    // Summary metrics are parsed from the Schedule sheet (not Generation Status).
    // Generation Status summary rows (41-47) use generator-column headers for summary
    // data, producing misleading values. Only outage data (cols 7-10) is reliable here.
    const summaries: Record<string, number | null> = {};

    // Get report date from row 49
    let reportDate: string | null = null;
    if (genData[49] && genData[49][3]) {
      const dateVal = genData[49][3];
      if (dateVal instanceof Date) {
        reportDate = dateVal.toISOString().split('T')[0];
      } else if (typeof dateVal === 'number' && dateVal > 40000) {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + dateVal * 86400000);
        reportDate = date.toISOString().split('T')[0];
      }
    }

    // Parse Schedule sheet for COL, Power Ships, Solar
    if (schedData) {
      // COL (rows 45-61)
      let colStation: string | null = null;
      for (let i = 45; i <= 61; i++) {
        const row = schedData[i];
        if (!row) continue;
        if (row[0] && typeof row[0] === 'string' && row[0].includes('COL')) {
          colStation = 'COL';
        }
        if (colStation === 'COL' && row[2] !== null && row[2] !== '') {
          if (!stationData['COL']) {
            stationData['COL'] = { units: 0, installed_mva: 0, derated_mw: 0, available_mw: 0, unit_details: [] };
          }
          const deratedMW = safeParseFloat(row[5]) || safeParseFloat(row[4]);
          stationData['COL'].units += 1;
          stationData['COL'].derated_mw += deratedMW;
          stationData['COL'].available_mw += deratedMW;
          stationData['COL'].unit_details.push({ unit: row[2] as string | number, derated_mw: deratedMW, available_mw: deratedMW });
        }
      }

      // Power Ship 1 (rows 62-63)
      for (let i = 62; i <= 63; i++) {
        const row = schedData[i];
        if (!row) continue;
        if (row[0] && typeof row[0] === 'string' && row[0].includes('Power Ship 1')) {
          if (!stationData['Power Ship 1 (PS1)']) {
            stationData['Power Ship 1 (PS1)'] = { units: 0, installed_mva: 0, derated_mw: 0, available_mw: 0, unit_details: [] };
          }
        }
        if (row[2] !== null && row[2] !== '' && stationData['Power Ship 1 (PS1)']) {
          const deratedMW = safeParseFloat(row[5]) || safeParseFloat(row[4]);
          stationData['Power Ship 1 (PS1)'].units += 1;
          stationData['Power Ship 1 (PS1)'].derated_mw += deratedMW;
          stationData['Power Ship 1 (PS1)'].available_mw += deratedMW;
          stationData['Power Ship 1 (PS1)'].unit_details.push({ unit: row[2] as string | number, derated_mw: deratedMW, available_mw: deratedMW });
        }
      }

      // Power Ship 2 (rows 64-67)
      for (let i = 64; i <= 67; i++) {
        const row = schedData[i];
        if (!row) continue;
        if (row[0] && typeof row[0] === 'string' && row[0].includes('Power Ship 2')) {
          if (!stationData['Power Ship 2 (PS2)']) {
            stationData['Power Ship 2 (PS2)'] = { units: 0, installed_mva: 0, derated_mw: 0, available_mw: 0, unit_details: [] };
          }
        }
        if (row[2] !== null && row[2] !== '' && stationData['Power Ship 2 (PS2)']) {
          const deratedMW = safeParseFloat(row[5]) || safeParseFloat(row[4]);
          stationData['Power Ship 2 (PS2)'].units += 1;
          stationData['Power Ship 2 (PS2)'].derated_mw += deratedMW;
          stationData['Power Ship 2 (PS2)'].available_mw += deratedMW;
          stationData['Power Ship 2 (PS2)'].unit_details.push({ unit: row[2] as string | number, derated_mw: deratedMW, available_mw: deratedMW });
        }
      }

      // Solar data (rows 74-76)
      if (schedData[74]) summaries.hampshireSolarMwp = safeParseFloat(schedData[74][4]) || safeParseFloat(schedData[74][5]);
      if (schedData[75]) summaries.prospectSolarMwp = safeParseFloat(schedData[75][4]) || safeParseFloat(schedData[75][5]);
      if (schedData[76]) summaries.trafalgarSolarMwp = safeParseFloat(schedData[76][4]) || safeParseFloat(schedData[76][5]);

      if (schedData[68]) summaries.totalFossilFromSchedule = safeParseFloat(schedData[68][5]) || safeParseFloat(schedData[68][4]) || null;
    }

    // Round station totals
    for (const station of Object.keys(stationData)) {
      stationData[station].installed_mva = Math.round(stationData[station].installed_mva * 100) / 100;
      stationData[station].derated_mw = Math.round(stationData[station].derated_mw * 100) / 100;
      stationData[station].available_mw = Math.round(stationData[station].available_mw * 100) / 100;
    }

    // Calculate totals
    let totalFossilCapacity = 0;
    for (const station of Object.values(stationData)) {
      totalFossilCapacity += station.available_mw;
    }
    totalFossilCapacity = Math.round(totalFossilCapacity * 100) / 100;

    const hampshireSolarMwp = summaries.hampshireSolarMwp || 0;
    const prospectSolarMwp = summaries.prospectSolarMwp || 0;
    const trafalgarSolarMwp = summaries.trafalgarSolarMwp || 0;
    const totalSolarMwp = hampshireSolarMwp + prospectSolarMwp + trafalgarSolarMwp;

    return {
      success: true,
      data: {
        reportDate,
        stationData,
        summaries: {
          totalFossilCapacity: totalFossilCapacity,
          hampshireSolarMwp,
          prospectSolarMwp,
          trafalgarSolarMwp,
          totalRenewableCapacity: totalSolarMwp,
          totalDBISCapacity: totalFossilCapacity + totalSolarMwp,
        },
        apiPayload: {
          reportDate,
          stationData: Object.fromEntries(
            Object.entries(stationData).map(([code, data]) => [
              code,
              { units: data.units, derated_mw: data.derated_mw, available_mw: data.available_mw },
            ])
          ),
          generationAvailability: totalFossilCapacity,
          hampshireSolarMwp,
          prospectSolarMwp,
          trafalgarSolarMwp,
        },
        meta: {
          sheetName: 'Generation Status + Schedule',
          stationCount: Object.keys(stationData).length,
          totalUnits: Object.values(stationData).reduce((sum, s) => sum + s.units, 0),
          calculatedTotalMW: totalFossilCapacity,
          totalSolarMwp,
          totalDBISCapacity: totalFossilCapacity + totalSolarMwp,
        },
      },
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to parse Excel file: ${msg}` };
  }
}
