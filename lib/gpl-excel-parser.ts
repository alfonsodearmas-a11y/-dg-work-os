import * as XLSX from 'xlsx';

interface UnitDetail {
  unit: any;
  installed_mva?: number;
  derated_mw: number;
  available_mw: number;
}

interface StationData {
  units: number;
  installed_mva: number;
  derated_mw: number;
  available_mw: number;
  unit_details: UnitDetail[];
}

interface ParseResult {
  success: boolean;
  error?: string;
  data?: {
    reportDate: string | null;
    stationData: Record<string, StationData>;
    summaries: Record<string, any>;
    apiPayload: Record<string, any>;
    meta: Record<string, any>;
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

    const genData = XLSX.utils.sheet_to_json(genStatusSheet, { header: 1, defval: null }) as any[][];
    const schedData = scheduleSheet
      ? (XLSX.utils.sheet_to_json(scheduleSheet, { header: 1, defval: null }) as any[][])
      : null;

    const stationData: Record<string, StationData> = {};
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

      const unitNo = row[2];
      const installedMVA = parseFloat(row[3]) || 0;
      const deratedMW = parseFloat(row[4]) || 0;
      const availableMW = parseFloat(row[5]) || 0;

      if (unitNo !== null && unitNo !== undefined && unitNo !== '') {
        if (!stationData[currentStation]) {
          stationData[currentStation] = { units: 0, installed_mva: 0, derated_mw: 0, available_mw: 0, unit_details: [] };
        }

        stationData[currentStation].units += 1;
        stationData[currentStation].installed_mva += installedMVA;
        stationData[currentStation].derated_mw += deratedMW;
        stationData[currentStation].available_mw += availableMW;
        stationData[currentStation].unit_details.push({
          unit: unitNo,
          installed_mva: installedMVA,
          derated_mw: deratedMW,
          available_mw: availableMW,
        });
      }
    }

    // Parse summary rows (41-47)
    const summaries: Record<string, any> = {};
    const summaryMap: Record<number, string> = {
      41: 'totalCapacity',
      42: 'expectedPeakDemand',
      43: 'reserveCapacity',
      44: 'averageFOR',
      45: 'expectedCapacity',
      46: 'expectedReserve',
      47: 'actualPeakDemand',
    };

    for (const [rowIdx, key] of Object.entries(summaryMap)) {
      const row = genData[parseInt(rowIdx)];
      if (row) {
        const value = parseFloat(row[5]) || parseFloat(row[6]) || null;
        if (value !== null && !isNaN(value)) {
          summaries[key] = Math.round(value * 100) / 100;
        }
      }
    }

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
          const deratedMW = parseFloat(row[5]) || parseFloat(row[4]) || 0;
          stationData['COL'].units += 1;
          stationData['COL'].derated_mw += deratedMW;
          stationData['COL'].available_mw += deratedMW;
          stationData['COL'].unit_details.push({ unit: row[2], derated_mw: deratedMW, available_mw: deratedMW });
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
          const deratedMW = parseFloat(row[5]) || parseFloat(row[4]) || 0;
          stationData['Power Ship 1 (PS1)'].units += 1;
          stationData['Power Ship 1 (PS1)'].derated_mw += deratedMW;
          stationData['Power Ship 1 (PS1)'].available_mw += deratedMW;
          stationData['Power Ship 1 (PS1)'].unit_details.push({ unit: row[2], derated_mw: deratedMW, available_mw: deratedMW });
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
          const deratedMW = parseFloat(row[5]) || parseFloat(row[4]) || 0;
          stationData['Power Ship 2 (PS2)'].units += 1;
          stationData['Power Ship 2 (PS2)'].derated_mw += deratedMW;
          stationData['Power Ship 2 (PS2)'].available_mw += deratedMW;
          stationData['Power Ship 2 (PS2)'].unit_details.push({ unit: row[2], derated_mw: deratedMW, available_mw: deratedMW });
        }
      }

      // Solar data (rows 74-76)
      if (schedData[74]) summaries.hampshireSolarMwp = parseFloat(schedData[74][4]) || parseFloat(schedData[74][5]) || 0;
      if (schedData[75]) summaries.prospectSolarMwp = parseFloat(schedData[75][4]) || parseFloat(schedData[75][5]) || 0;
      if (schedData[76]) summaries.trafalgarSolarMwp = parseFloat(schedData[76][4]) || parseFloat(schedData[76][5]) || 0;

      if (schedData[68]) summaries.totalFossilFromSchedule = parseFloat(schedData[68][5]) || parseFloat(schedData[68][4]) || null;
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

    const totalSolarMwp = (summaries.hampshireSolarMwp || 0) + (summaries.prospectSolarMwp || 0) + (summaries.trafalgarSolarMwp || 0);

    return {
      success: true,
      data: {
        reportDate,
        stationData,
        summaries: {
          totalFossilCapacity: summaries.totalCapacity || totalFossilCapacity,
          expectedPeakDemand: summaries.expectedPeakDemand,
          reserveCapacity: summaries.reserveCapacity,
          actualPeakDemand: summaries.actualPeakDemand,
          hampshireSolarMwp: summaries.hampshireSolarMwp || 0,
          prospectSolarMwp: summaries.prospectSolarMwp || 0,
          trafalgarSolarMwp: summaries.trafalgarSolarMwp || 0,
          totalRenewableCapacity: totalSolarMwp,
          totalDBISCapacity: (summaries.totalCapacity || totalFossilCapacity) + totalSolarMwp,
        },
        apiPayload: {
          reportDate,
          stationData: Object.fromEntries(
            Object.entries(stationData).map(([code, data]) => [
              code,
              { units: data.units, derated_mw: data.derated_mw, available_mw: data.available_mw },
            ])
          ),
          eveningPeakOnbars: summaries.expectedPeakDemand,
          generationAvailability: summaries.totalCapacity || totalFossilCapacity,
          hampshireSolarMwp: summaries.hampshireSolarMwp || 0,
          prospectSolarMwp: summaries.prospectSolarMwp || 0,
          trafalgarSolarMwp: summaries.trafalgarSolarMwp || 0,
        },
        meta: {
          sheetName: 'Generation Status + Schedule',
          stationCount: Object.keys(stationData).length,
          totalUnits: Object.values(stationData).reduce((sum, s) => sum + s.units, 0),
          calculatedTotalMW: totalFossilCapacity,
          totalFromSheet: summaries.totalCapacity,
          totalSolarMwp,
          totalDBISCapacity: (summaries.totalCapacity || totalFossilCapacity) + totalSolarMwp,
        },
      },
    };
  } catch (error: any) {
    return { success: false, error: `Failed to parse Excel file: ${error.message}` };
  }
}
