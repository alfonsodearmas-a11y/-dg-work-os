/**
 * Import pending service connection applications from GPL and GWI Excel files.
 *
 * Usage:
 *   npx tsx scripts/import_pending_applications.ts --gwi ./path/to/gwi.xlsx --gpl ./path/to/gpl.xls
 *
 * Either --gwi or --gpl (or both) can be provided.
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(): { gwi?: string; gpl?: string } {
  const args = process.argv.slice(2);
  const result: { gwi?: string; gpl?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--gwi' && args[i + 1]) result.gwi = args[++i];
    if (args[i] === '--gpl' && args[i + 1]) result.gpl = args[++i];
  }
  return result;
}

/** Convert Excel serial date to JS Date */
function excelSerialToDate(serial: number): Date {
  // Excel epoch is 1899-12-30
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function extractDateFromFilename(filename: string): string | null {
  // Look for month + day pattern like "February 27"
  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };
  const match = filename.match(/(\w+)\s+(\d{1,2})/i);
  if (match) {
    const month = months[match[1].toLowerCase()];
    if (month !== undefined) {
      const year = new Date().getFullYear();
      return formatDate(new Date(year, month, parseInt(match[2])));
    }
  }
  return formatDate(new Date());
}

interface PendingRecord {
  agency: 'GPL' | 'GWI';
  customer_reference: string | null;
  first_name: string | null;
  last_name: string | null;
  telephone: string | null;
  region: string | null;
  district: string | null;
  village_ward: string | null;
  street: string | null;
  lot: string | null;
  event_code: string | null;
  event_description: string | null;
  application_date: string;
  days_waiting: number;
  raw_data: Record<string, unknown>;
  data_as_of: string;
}

// ── GWI Parser ───────────────────────────────────────────────────────────────

function parseGWI(filePath: string): PendingRecord[] {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('detail')) || wb.SheetNames[1] || wb.SheetNames[0];
  const data: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

  // Find header row (contains REGION and CUSTOMER_REFERENCE)
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
    console.error('GWI: Could not find header row with REGION + CUSTOMER_REFERENCE columns');
    return [];
  }

  const headers = (data[headerIdx] as string[]).map(h => String(h).trim().toUpperCase());
  console.log('GWI columns:', headers.join(', '));

  const col = (name: string) => headers.indexOf(name);
  const records: PendingRecord[] = [];

  // Extract data_as_of from title row
  let dataAsOf = formatDate(new Date());
  const titleRow = data[0];
  if (titleRow && titleRow[0]) {
    const titleStr = String(titleRow[0]);
    // Match date pattern in title like "January 1 to February 22,2026"
    const dateMatch = titleStr.match(/to\s+(\w+)\s+(\d{1,2}),?\s*(\d{4})/i);
    if (dateMatch) {
      const months: Record<string, number> = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      };
      const m = months[dateMatch[1].toLowerCase()];
      if (m !== undefined) {
        dataAsOf = formatDate(new Date(parseInt(dateMatch[3]), m, parseInt(dateMatch[2])));
      }
    }
  }

  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 3) continue;
    const region = row[col('REGION')];
    if (!region) continue;

    // RECORD_DATE is an Excel serial number; DAYS_DIFFERENCE is the wait time
    let recordDate = row[col('RECORD_DATE')];
    let daysWaiting = row[col('DAYS_DIFFERENCE')];

    let applicationDate: string;
    if (typeof recordDate === 'number') {
      applicationDate = formatDate(excelSerialToDate(recordDate));
    } else if (typeof recordDate === 'string') {
      const d = new Date(recordDate);
      applicationDate = isNaN(d.getTime()) ? dataAsOf : formatDate(d);
    } else {
      applicationDate = dataAsOf;
    }

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
      days_waiting: typeof daysWaiting === 'number' ? Math.round(daysWaiting) : 0,
      raw_data: rawObj,
      data_as_of: dataAsOf,
    });
  }

  return records;
}

// ── GPL Parser ───────────────────────────────────────────────────────────────

function parseGPL(filePath: string): PendingRecord[] {
  const wb = XLSX.readFile(filePath);
  // Prefer the second sheet (most recent day, more detailed columns)
  const sheetName = wb.SheetNames.length > 1 ? wb.SheetNames[1] : wb.SheetNames[0];
  const data: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

  // Extract data_as_of from sheet name or file
  let dataAsOf = extractDateFromFilename(filePath) || formatDate(new Date());
  // Try sheet name — e.g. "Open NS Orders COB February 26"
  const sheetDateMatch = sheetName.match(/(\w+)\s+(\d{1,2})/);
  if (sheetDateMatch) {
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };
    const m = months[sheetDateMatch[1].toLowerCase()];
    if (m !== undefined) {
      const year = new Date().getFullYear();
      dataAsOf = formatDate(new Date(year, m, parseInt(sheetDateMatch[2])));
    }
  }

  // Find all section headers — rows with "No." in first or second column and "Customer" nearby
  interface Section {
    name: string;
    headerRow: number;
    headers: string[];
  }
  const sections: Section[] = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    // Detect header rows: contains "No." and "Customer" and "Name" or "Account"
    const rowStr = row.map(c => String(c || '').trim()).join('|');
    if (rowStr.includes('No.') && (rowStr.includes('Customer') || rowStr.includes('Account')) && rowStr.includes('Name')) {
      // Look above for section title
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

  console.log(`GPL: Found ${sections.length} sections in sheet "${sheetName}"`);
  sections.forEach(s => console.log(`  - ${s.name} (row ${s.headerRow}): ${s.headers.filter(Boolean).join(', ')}`));

  const records: PendingRecord[] = [];
  const today = new Date();

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const endRow = sIdx + 1 < sections.length ? sections[sIdx + 1].headerRow : data.length;
    const headers = section.headers.map(h => h.toUpperCase().replace(/[#]/g, '').trim());

    // Column mapping — GPL has varying column structures across sections
    const findCol = (...candidates: string[]) => {
      for (const c of candidates) {
        const idx = headers.findIndex(h => h.includes(c));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const noCol = findCol('NO');
    const custCol = findCol('CUSTOMER');
    const acctCol = findCol('ACCOUNT');
    const nameCol = findCol('NAME');
    const firstNameCol = findCol('FIRST NAME');
    const lastNameCol = findCol('LAST NAME');
    const addressCol = findCol('SERVICE ADDRESS', 'ADDRESS');
    const cityCol = findCol('TOWN', 'CITY');
    const cycleCol = findCol('CYCLE');
    const dateCreatedCol = findCol('DATE/TIME CREATED', 'DATE CREATED', 'DATE/TIME');
    const daysElapsedCol = findCol('DAYS ELAPSED', 'TIMELINE ELAPSED', 'DAYS');
    const typeCol = findCol('TYPE OF SERVICE');
    const statusCol = findCol('ACCOUNT STATUS');

    for (let i = section.headerRow + 1; i < endRow; i++) {
      const row = data[i];
      if (!row || row.length < 3) continue;
      // Skip empty rows — check that the row number cell or customer cell has data
      const rowNo = noCol >= 0 ? row[noCol] : null;
      if (rowNo === null || rowNo === undefined || rowNo === '') continue;
      if (typeof rowNo === 'string' && isNaN(parseInt(rowNo))) continue;

      // Parse name — some sections have single "Name" column, others have First/Last
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

      // Parse date created
      let applicationDate: string;
      const rawDate = dateCreatedCol >= 0 ? row[dateCreatedCol] : null;
      if (typeof rawDate === 'number') {
        applicationDate = formatDate(excelSerialToDate(rawDate));
      } else if (typeof rawDate === 'string') {
        const d = new Date(rawDate);
        applicationDate = isNaN(d.getTime()) ? dataAsOf : formatDate(d);
      } else {
        applicationDate = dataAsOf;
      }

      // Days waiting — either from explicit column or compute from date
      let daysWaiting = 0;
      const rawDays = daysElapsedCol >= 0 ? row[daysElapsedCol] : null;
      if (typeof rawDays === 'number') {
        daysWaiting = Math.round(rawDays);
      } else {
        // Compute from application date
        const appDate = new Date(applicationDate);
        daysWaiting = Math.max(0, Math.round((today.getTime() - appDate.getTime()) / 86400000));
      }

      const customerRef = custCol >= 0 && row[custCol] ? String(row[custCol]).trim() : null;

      // Build address/region from city column
      const city = cityCol >= 0 && row[cityCol] ? String(row[cityCol]).trim() : null;
      const address = addressCol >= 0 && row[addressCol] ? String(row[addressCol]).trim() : null;

      const rawObj: Record<string, unknown> = { _section: section.name };
      headers.forEach((h, idx) => { if (h) rawObj[h] = row[idx]; });

      records.push({
        agency: 'GPL',
        customer_reference: customerRef,
        first_name: firstName,
        last_name: lastName,
        telephone: null, // GPL files don't include phone numbers
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
      });
    }
  }

  return records;
}

// ── Upsert to Supabase ──────────────────────────────────────────────────────

async function upsertRecords(records: PendingRecord[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  // First, delete existing records for agencies being imported (full refresh)
  const agencies = [...new Set(records.map(r => r.agency))];
  for (const agency of agencies) {
    const { error } = await supabase
      .from('pending_applications')
      .delete()
      .eq('agency', agency);
    if (error) console.error(`Error clearing ${agency} records:`, error.message);
  }

  // Insert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('pending_applications')
      .insert(batch)
      .select('id');

    if (error) {
      console.error(`Error inserting batch at offset ${i}:`, error.message);
    } else {
      inserted += data?.length || 0;
    }
  }

  return { inserted, updated };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.gwi && !args.gpl) {
    console.error('Usage: npx tsx scripts/import_pending_applications.ts --gwi ./path/to/gwi.xlsx --gpl ./path/to/gpl.xls');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Pending Applications Import');
  console.log('═══════════════════════════════════════════════════════\n');

  let allRecords: PendingRecord[] = [];

  if (args.gwi) {
    console.log(`📂 Parsing GWI file: ${args.gwi}`);
    const gwiRecords = parseGWI(args.gwi);
    console.log(`   → ${gwiRecords.length} GWI records parsed\n`);
    allRecords.push(...gwiRecords);
  }

  if (args.gpl) {
    console.log(`📂 Parsing GPL file: ${args.gpl}`);
    const gplRecords = parseGPL(args.gpl);
    console.log(`   → ${gplRecords.length} GPL records parsed\n`);
    allRecords.push(...gplRecords);
  }

  if (allRecords.length === 0) {
    console.log('No records to import.');
    return;
  }

  console.log('⬆️  Uploading to Supabase...');
  const result = await upsertRecords(allRecords);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Import Summary');
  console.log('═══════════════════════════════════════════════════════');

  const gwiCount = allRecords.filter(r => r.agency === 'GWI').length;
  const gplCount = allRecords.filter(r => r.agency === 'GPL').length;

  if (gwiCount > 0) {
    const gwiDataAsOf = allRecords.find(r => r.agency === 'GWI')?.data_as_of;
    console.log(`  GWI: ${gwiCount} records (data as of ${gwiDataAsOf})`);
  }
  if (gplCount > 0) {
    const gplDataAsOf = allRecords.find(r => r.agency === 'GPL')?.data_as_of;
    console.log(`  GPL: ${gplCount} records (data as of ${gplDataAsOf})`);
  }
  console.log(`  Total inserted: ${result.inserted}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
