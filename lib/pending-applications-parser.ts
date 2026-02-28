import * as XLSX from 'xlsx';
import type { PendingRecord, ParseResult } from './pending-applications-types';

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
  [/meter/i, 'Metering'],
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

export function parseGPLBuffer(buffer: Buffer): ParseResult {
  const warnings: string[] = [];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    // Select last sheet (most recent data)
    const sheetName = wb.SheetNames[wb.SheetNames.length - 1];
    const data: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

    // Extract data_as_of from sheet name — e.g. "Open NS Orders COB February 26"
    let dataAsOf = formatDate(new Date());
    const sheetDateMatch = sheetName.match(/(\w+)\s+(\d{1,2})/);
    if (sheetDateMatch) {
      const m = MONTHS[sheetDateMatch[1].toLowerCase()];
      if (m !== undefined) {
        const year = new Date().getFullYear();
        dataAsOf = formatDate(new Date(year, m, parseInt(sheetDateMatch[2])));
      }
    }

    // Find all section headers
    interface Section {
      name: string;
      headerRow: number;
      headers: string[];
    }
    const sections: Section[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const rowStr = row.map(c => String(c || '').trim()).join('|');
      if (rowStr.includes('No.') && (rowStr.includes('Customer') || rowStr.includes('Account')) && rowStr.includes('Name')) {
        let sectionName = 'Unknown';
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const titleRow = data[j];
          if (titleRow && titleRow.some(c => typeof c === 'string' && c.includes('Outstanding'))) {
            sectionName = String(titleRow.find(c => typeof c === 'string' && c.includes('Outstanding')) || 'Unknown');
            break;
          }
        }
        const headers = row.map(c => String(c || '').trim());
        sections.push({ name: sectionName, headerRow: i, headers });
      }
    }

    if (sections.length === 0) {
      warnings.push(`No data sections found in sheet "${sheetName}"`);
    }

    const records: PendingRecord[] = [];
    const today = new Date();

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx];
      const endRow = sIdx + 1 < sections.length ? sections[sIdx + 1].headerRow : data.length;
      const headers = section.headers.map(h => h.toUpperCase().replace(/[#]/g, '').trim());
      const pipelineStage = detectPipelineStage(section.name);

      const findCol = (...candidates: string[]) => {
        for (const c of candidates) {
          const idx = headers.findIndex(h => h.includes(c));
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const noCol = findCol('NO');
      const custCol = findCol('CUSTOMER');
      const nameCol = findCol('NAME');
      const firstNameCol = findCol('FIRST NAME');
      const lastNameCol = findCol('LAST NAME');
      const addressCol = findCol('SERVICE ADDRESS', 'ADDRESS');
      const cityCol = findCol('TOWN', 'CITY');
      const cycleCol = findCol('CYCLE');
      const dateCreatedCol = findCol('DATE/TIME CREATED', 'DATE CREATED', 'DATE/TIME');
      const daysElapsedCol = findCol('DAYS ELAPSED', 'TIMELINE ELAPSED', 'DAYS');
      const typeCol = findCol('TYPE OF SERVICE', 'SERVICE TYPE');
      const statusCol = findCol('ACCOUNT STATUS', 'STATUS');
      const acctTypeCol = findCol('ACCOUNT TYPE', 'ACCT TYPE');
      const soTypeCol = findCol('SERVICE ORDER TYPE', 'SO TYPE', 'ORDER TYPE');
      const soNumCol = findCol('SERVICE ORDER', 'SO NO', 'SO NUMBER', 'ORDER NO');
      const divCol = findCol('DIVISION', 'DIV');

      for (let i = section.headerRow + 1; i < endRow; i++) {
        const row = data[i];
        if (!row || row.length < 3) continue;
        const rowNo = noCol >= 0 ? row[noCol] : null;
        if (rowNo === null || rowNo === undefined || rowNo === '') continue;
        if (typeof rowNo === 'string' && isNaN(parseInt(rowNo))) continue;

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

        const applicationDate = parseDateString(dateCreatedCol >= 0 ? row[dateCreatedCol] : null, dataAsOf);

        let daysWaiting = 0;
        const rawDays = daysElapsedCol >= 0 ? row[daysElapsedCol] : null;
        if (typeof rawDays === 'number') {
          daysWaiting = Math.round(rawDays);
        } else {
          const appDate = new Date(applicationDate);
          daysWaiting = Math.max(0, Math.round((today.getTime() - appDate.getTime()) / 86400000));
        }

        const customerRef = custCol >= 0 && row[custCol] ? String(row[custCol]).trim() : null;
        const city = cityCol >= 0 && row[cityCol] ? String(row[cityCol]).trim() : null;
        const address = addressCol >= 0 && row[addressCol] ? String(row[addressCol]).trim() : null;

        const rawObj: Record<string, unknown> = { _section: section.name };
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
          event_description: typeCol >= 0 && row[typeCol] ? String(row[typeCol]).trim() :
                            statusCol >= 0 && row[statusCol] ? String(row[statusCol]).trim() : section.name,
          application_date: applicationDate,
          days_waiting: daysWaiting,
          raw_data: rawObj,
          data_as_of: dataAsOf,
          pipeline_stage: pipelineStage,
          account_type: acctTypeCol >= 0 && row[acctTypeCol] ? String(row[acctTypeCol]).trim() : null,
          service_order_type: soTypeCol >= 0 && row[soTypeCol] ? String(row[soTypeCol]).trim() : null,
          service_order_number: soNumCol >= 0 && row[soNumCol] ? String(row[soNumCol]).trim() : null,
          account_status: statusCol >= 0 && row[statusCol] ? String(row[statusCol]).trim() : null,
          cycle: cycleCol >= 0 && row[cycleCol] ? String(row[cycleCol]).trim() : null,
          division_code: divCol >= 0 && row[divCol] ? String(row[divCol]).trim() : null,
        });
      }
    }

    return { success: true, records, agency: 'GPL', dataAsOf, sheetName, warnings };
  } catch (err) {
    return { success: false, records: [], agency: 'GPL', dataAsOf: '', sheetName: '', warnings: [`Parse error: ${err instanceof Error ? err.message : String(err)}`] };
  }
}
