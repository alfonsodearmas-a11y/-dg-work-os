import * as XLSX from 'xlsx';
import type { PendingRecord, ParseResult } from './pending-applications-types';
import { classifyByServiceType, classifySheetByName, isRecognisedServiceType } from './service-connection-track';

// ── Helpers ──────────────────────────────────────────────────────────────────

function excelSerialToDate(serial: number): Date {
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parseDateString(raw: unknown, fallback: string): string {
  if (typeof raw === 'number') return formatDate(excelSerialToDate(raw));
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? fallback : formatDate(d);
  }
  return fallback;
}

// ── Pipeline Stage Detection ─────────────────────────────────────────────────

const STAGE_MAP: [RegExp, string][] = [
  [/met[er]?ring|meter/i, 'Metering'],
  [/design/i, 'Designs'],
  [/execut/i, 'Execution'],
  [/survey/i, 'Survey'],
  [/estimat/i, 'Estimation'],
  [/approv/i, 'Approval'],
];

function detectPipelineStage(sectionName: string): string {
  for (const [pattern, stage] of STAGE_MAP) {
    if (pattern.test(sectionName)) return stage;
  }
  return 'Other';
}

// ── Agency Auto-Detection ────────────────────────────────────────────────────

export function detectAgency(buffer: Buffer): 'GPL' | 'GWI' | null {
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    for (const sheetName of wb.SheetNames) {
      const data: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
      const first20 = data.slice(0, 20);
      for (const row of first20) {
        if (!row) continue;
        const rowStr = row.map(c => String(c || '')).join(' ').toUpperCase();
        if (rowStr.includes('NS OUTSTANDING') || rowStr.includes('NEW SERVICE') && rowStr.includes('GPL')) return 'GPL';
        if (rowStr.includes('CUSTOMER_REFERENCE') || rowStr.includes('GWI') && rowStr.includes('REGION')) return 'GWI';
      }
    }
    // Check sheet names
    for (const name of wb.SheetNames) {
      if (/open.*ns.*order/i.test(name) || /outstanding/i.test(name)) return 'GPL';
      if (/detail/i.test(name) || /gwi/i.test(name)) return 'GWI';
    }
    return null;
  } catch {
    return null;
  }
}

// ── GWI Parser ───────────────────────────────────────────────────────────────

export function parseGWIBuffer(buffer: Buffer): ParseResult {
  const warnings: string[] = [];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('detail')) || wb.SheetNames[1] || wb.SheetNames[0];
    const data: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

    // Find header row
    let headerIdx = -1;
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const row = data[i];
      if (row && row.some(c => String(c).toUpperCase() === 'REGION') &&
          row.some(c => String(c).toUpperCase() === 'CUSTOMER_REFERENCE')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      return { success: false, records: [], agency: 'GWI', dataAsOf: '', sheetName: '', warnings: ['Could not find header row with REGION + CUSTOMER_REFERENCE columns'] };
    }

    const headers = (data[headerIdx] as string[]).map(h => String(h).trim().toUpperCase());
    const col = (name: string) => headers.indexOf(name);

    // Extract data_as_of from title row
    let dataAsOf = formatDate(new Date());
    const titleRow = data[0];
    if (titleRow && titleRow[0]) {
      const titleStr = String(titleRow[0]);
      const dateMatch = titleStr.match(/to\s+(\w+)\s+(\d{1,2}),?\s*(\d{4})/i);
      if (dateMatch) {
        const m = MONTHS[dateMatch[1].toLowerCase()];
        if (m !== undefined) {
          dataAsOf = formatDate(new Date(parseInt(dateMatch[3]), m, parseInt(dateMatch[2])));
        }
      }
    }

    const records: PendingRecord[] = [];

    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 3) continue;
      const region = row[col('REGION')];
      if (!region) continue;

      const applicationDate = parseDateString(row[col('RECORD_DATE')], dataAsOf);
      const rawDays = row[col('DAYS_DIFFERENCE')];

      const rawObj: Record<string, unknown> = {};
      headers.forEach((h, idx) => { rawObj[h] = row[idx]; });

      records.push({
        agency: 'GWI',
        customer_reference: row[col('CUSTOMER_REFERENCE')] ? String(row[col('CUSTOMER_REFERENCE')]) : null,
        first_name: row[col('FIRST_NAME')] ? String(row[col('FIRST_NAME')]) : null,
        last_name: row[col('LAST_NAME')] ? String(row[col('LAST_NAME')]) : null,
        telephone: row[col('TELEPHONE')] ? String(row[col('TELEPHONE')]) : null,
        region: String(region),
        district: row[col('DISTRICT')] ? String(row[col('DISTRICT')]) : null,
        village_ward: row[col('VILLAGE_WARD')] ? String(row[col('VILLAGE_WARD')]) : null,
        street: row[col('STREET')] ? String(row[col('STREET')]) : null,
        lot: row[col('LOT')] ? String(row[col('LOT')]) : null,
        event_code: row[col('EVENT_CODE')] ? String(row[col('EVENT_CODE')]) : null,
        event_description: row[col('EVENT_DESCRIPTION')] ? String(row[col('EVENT_DESCRIPTION')]) : null,
        application_date: applicationDate,
        days_waiting: typeof rawDays === 'number' ? Math.round(rawDays) : 0,
        raw_data: rawObj,
        data_as_of: dataAsOf,
      });
    }

    return { success: true, records, agency: 'GWI', dataAsOf, sheetName, warnings };
  } catch (err) {
    return { success: false, records: [], agency: 'GWI', dataAsOf: '', sheetName: '', warnings: [`Parse error: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

// ── GPL Parser ───────────────────────────────────────────────────────────────
// Handles multi-sheet format with separate Outstanding/Completed sheets per track.
// Computes date diffs directly from raw date columns (not formula cells).

export function parseGPLBuffer(buffer: Buffer): ParseResult {
  const warnings: string[] = [];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const records: PendingRecord[] = [];
    const today = new Date();

    // Extract data_as_of from any sheet name containing a date
    let dataAsOf = formatDate(today);
    for (const sn of wb.SheetNames) {
      // Match patterns like "March3", "Feb28", "mar4"
      const dateMatch = sn.match(/([A-Za-z]+)\s*(\d{1,2})/);
      if (dateMatch) {
        const m = MONTHS[dateMatch[1].toLowerCase()];
        if (m !== undefined) {
          const day = parseInt(dateMatch[2]);
          // Handle year crossover: if the extracted month is in the future
          // (e.g. December file uploaded in January), use the previous year
          let year = today.getFullYear();
          const candidate = new Date(year, m, day);
          if (candidate.getTime() > today.getTime() + 30 * 86400000) {
            year--;
          }
          dataAsOf = formatDate(new Date(year, m, day));
          break;
        }
      }
    }

    // Process each sheet except Summary
    for (const sheetName of wb.SheetNames) {
      if (/^summary$/i.test(sheetName.trim())) continue;

      const isCompleted = /completed/i.test(sheetName);
      const sheetDefaults = classifySheetByName(sheetName);

      const sheet = wb.Sheets[sheetName];
      const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Find header row: first row with 4+ non-null values AND at least 2
      // known column keywords (to avoid matching title/subtitle rows)
      const HEADER_KEYWORDS = ['NO', 'CUSTOMER', 'NAME', 'ADDRESS', 'SERVICE', 'DATE', 'ACCOUNT', 'STATUS', 'TYPE', 'CYCLE', 'DIVISION', 'ORDER', 'TOWN'];
      let headerIdx = -1;
      for (let i = 0; i < Math.min(data.length, 15); i++) {
        const row = data[i] as unknown[];
        if (!row) continue;
        const cells = row.map(c => String(c || '').trim().toUpperCase());
        const nonNull = cells.filter(c => c !== '').length;
        if (nonNull < 4) continue;
        const keywordHits = HEADER_KEYWORDS.filter(kw =>
          cells.some(c => c.includes(kw))
        ).length;
        if (keywordHits >= 2) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        warnings.push(`No header row found in sheet "${sheetName}"`);
        continue;
      }

      const headers = (data[headerIdx] as unknown[]).map(c =>
        String(c || '').trim().toUpperCase()
      );

      const findCol = (...candidates: string[]) => {
        for (const c of candidates) {
          const idx = headers.findIndex(h => h.includes(c));
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const custCol = findCol('CUSTOMER', 'ACCOUNT NO');
      const nameCol = findCol('NAME');
      const firstNameCol = findCol('FIRST NAME');
      const lastNameCol = findCol('LAST NAME');
      const addressCol = findCol('SERVICE ADDRESS', 'ADDRESS');
      const cityCol = findCol('TOWN', 'CITY');
      const cycleCol = findCol('CYCLE');
      const dateCreatedCol = findCol('DATE/TIME CREATED', 'DATE CREATED', 'DATE/TIME');
      const dateCompletedCol = findCol('DATE WORK COMPLETED', 'DATE COMPLETED', 'COMPLETION');
      const currentDateCol = findCol('CURRENT DATE');
      const typeCol = findCol('TYPE OF SERVICE');
      const statusCol = findCol('ACCOUNT STATUS', 'STATUS');
      const acctTypeCol = findCol('ACCOUNT TYPE', 'ACCT TYPE');
      const soTypeCol = findCol('SERVICE ORDER TYPE', 'SO TYPE', 'ORDER TYPE');
      const soNumCol = findCol('SERVICE ORDER', 'SO NO', 'SO NUMBER', 'ORDER NO');
      const divCol = findCol('DIVISION', 'DIV');

      let sheetRecordCount = 0;

      for (let i = headerIdx + 1; i < data.length; i++) {
        const row = data[i] as unknown[];
        if (!row) continue;

        // Validate row: must have 3+ non-empty cells (ignore No. column which uses formulas)
        const nonEmpty = row.filter(c =>
          c !== null && c !== undefined && c !== ''
        ).length;
        if (nonEmpty < 3) continue;

        // Must have a customer reference or a name to be a valid data row
        const hasCust = custCol >= 0 && row[custCol] != null && String(row[custCol]).trim() !== '';
        const hasName = (firstNameCol >= 0 && row[firstNameCol] != null && String(row[firstNameCol]).trim() !== '') ||
                        (nameCol >= 0 && row[nameCol] != null && String(row[nameCol]).trim() !== '');
        if (!hasCust && !hasName) continue;

        // Parse names
        let firstName: string | null = null;
        let lastName: string | null = null;
        if (firstNameCol >= 0 && lastNameCol >= 0) {
          firstName = row[firstNameCol] ? String(row[firstNameCol]).trim() : null;
          lastName = row[lastNameCol] ? String(row[lastNameCol]).trim() : null;
        } else if (nameCol >= 0) {
          const fullName = row[nameCol] ? String(row[nameCol]).trim() : '';
          const parts = fullName.split(/\s+/);
          if (parts.length > 1) {
            lastName = parts.pop()!;
            firstName = parts.join(' ');
          } else {
            firstName = fullName;
          }
        }

        // Parse application date from Date/Time Created column
        const applicationDate = parseDateString(
          dateCreatedCol >= 0 ? row[dateCreatedCol] : null,
          dataAsOf,
        );

        // Compute days directly from date columns — do NOT use formula cells
        let daysWaiting = 0;
        let dateWorkCompleted: string | undefined;

        if (isCompleted && dateCompletedCol >= 0 && row[dateCompletedCol] != null) {
          // Completed sheets: diff = Date Work Completed − Date/Time Created
          const completedDate = parseDateString(row[dateCompletedCol], dataAsOf);
          dateWorkCompleted = completedDate;
          const start = new Date(applicationDate + 'T00:00:00');
          const end = new Date(completedDate + 'T00:00:00');
          if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            daysWaiting = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
          }
        } else {
          // Outstanding sheets: diff = current date − Date/Time Created
          let endDate = today;
          if (currentDateCol >= 0 && row[currentDateCol] != null) {
            const parsed = parseDateString(row[currentDateCol], '');
            if (parsed) {
              const d = new Date(parsed + 'T00:00:00');
              if (!isNaN(d.getTime())) endDate = d;
            }
          }
          const start = new Date(applicationDate + 'T00:00:00');
          if (!isNaN(start.getTime())) {
            daysWaiting = Math.max(0, Math.round((endDate.getTime() - start.getTime()) / 86400000));
          }
        }

        // Classify track from Type of Service Order column (primary)
        // or fall back to sheet name classification
        const serviceOrderTypeValue = typeCol >= 0 && row[typeCol]
          ? String(row[typeCol]).trim()
          : null;
        let recordTrack = sheetDefaults.track;
        let recordStage = sheetDefaults.stage;
        if (serviceOrderTypeValue) {
          if (!isRecognisedServiceType(serviceOrderTypeValue)) {
            const warnKey = `Unrecognised service type "${serviceOrderTypeValue}" (defaulting to Track A)`;
            if (!warnings.includes(warnKey)) warnings.push(warnKey);
          }
          const classified = classifyByServiceType(serviceOrderTypeValue);
          recordTrack = classified.track;
          recordStage = classified.stage;
        }

        const customerRef = custCol >= 0 && row[custCol] ? String(row[custCol]).trim() : null;
        const city = cityCol >= 0 && row[cityCol] ? String(row[cityCol]).trim() : null;
        const address = addressCol >= 0 && row[addressCol] ? String(row[addressCol]).trim() : null;

        const rawObj: Record<string, unknown> = {
          _sheet: sheetName,
          _isCompleted: isCompleted,
          _track: recordTrack,
        };
        headers.forEach((h, idx) => { if (h) rawObj[h] = row[idx]; });

        records.push({
          agency: 'GPL',
          customer_reference: customerRef,
          first_name: firstName,
          last_name: lastName,
          telephone: null,
          region: city || null,
          district: null,
          village_ward: address || null,
          street: null,
          lot: null,
          event_code: cycleCol >= 0 && row[cycleCol] ? String(row[cycleCol]).trim() : null,
          event_description: serviceOrderTypeValue || sheetName,
          application_date: applicationDate,
          days_waiting: daysWaiting,
          raw_data: rawObj,
          data_as_of: dataAsOf,
          pipeline_stage: recordStage,
          account_type: acctTypeCol >= 0 && row[acctTypeCol] ? String(row[acctTypeCol]).trim() : null,
          service_order_type: serviceOrderTypeValue,
          service_order_number: soNumCol >= 0 && row[soNumCol] ? String(row[soNumCol]).trim() : null,
          account_status: statusCol >= 0 && row[statusCol] ? String(row[statusCol]).trim() : null,
          cycle: cycleCol >= 0 && row[cycleCol] ? String(row[cycleCol]).trim() : null,
          division_code: divCol >= 0 && row[divCol] ? String(row[divCol]).trim() : null,
          is_completed: isCompleted,
          date_work_completed: dateWorkCompleted,
          days_taken: isCompleted ? daysWaiting : undefined,
        });
        sheetRecordCount++;
      }

      if (sheetRecordCount === 0) {
        warnings.push(`No data rows found in sheet "${sheetName}"`);
      }
    }

    return { success: true, records, agency: 'GPL', dataAsOf, sheetName: 'All sheets', warnings };
  } catch (err) {
    return { success: false, records: [], agency: 'GPL', dataAsOf: '', sheetName: '', warnings: [`Parse error: ${err instanceof Error ? err.message : String(err)}`] };
  }
}
