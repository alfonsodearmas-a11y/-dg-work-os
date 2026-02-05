import * as XLSX from 'xlsx';
import { toTitleCase, formatContractorName, formatRegion, formatStatus } from './text-utils';

const COLUMN_MAPPINGS: Record<string, string[]> = {
  'project_reference': [
    'project reference', 'reference', 'project ref', 'ref', 'project id',
    'proj ref', 'project no', 'project number', 'ref no', 'reference no',
    'proj no', 'proj id', 'project code', 'code'
  ],
  'sub_agency': [
    'sub agency', 'sub-agency', 'subagency', 'agency code', 'dept', 'department code'
  ],
  'executing_agency': [
    'executing agency', 'agency', 'ministry', 'department', 'org', 'organization',
    'implementing agency', 'impl agency'
  ],
  'project_name': [
    'project name', 'project description', 'project title', 'description',
    'title', 'name of project', 'project', 'name', 'works', 'scope',
    'project scope', 'details', 'project details'
  ],
  'region': [
    'region', 'target region', 'location', 'area', 'district', 'zone',
    'geographical area', 'geo area', 'site', 'site location', 'province',
    'regional', 'regions', 'target area'
  ],
  'contract_value': [
    'contract value', 'value', 'contract amount', 'amount', 'contract sum',
    'total value', 'cost', 'contract price', 'price', 'sum', 'total contract',
    'original contract', 'contract cost'
  ],
  'contractor': [
    'contractor(s)', 'contractor', 'contractors', 'vendor', 'company',
    'supplier', 'firm', 'contractor name', 'company name', 'awarded to',
    'contract awarded to', 'winner', 'successful bidder', 'service provider',
    'consultant', 'contractors name', "contractor's name"
  ],
  'completion_percent': [
    'completion percent', 'completion %', '% complete', 'progress',
    'percent complete', 'physical progress', '% completion', 'completion',
    'complete %', 'complete', '% completed', 'completed %', 'completed',
    'physical %', 'physical completion', 'work progress', 'progress %',
    '% progress', 'percentage complete', 'percentage completion',
    'pct complete', 'pct completion', '% physical', 'physical progress %'
  ],
  'project_status': [
    'project status', 'status', 'state', 'current status', 'project state',
    'work status', 'implementation status', 'progress status'
  ],
  'allocated_balance': [
    'total allocated balance', 'allocated', 'budget', 'allocation',
    'allocated amount', 'total allocation', 'approved budget', 'budgeted',
    'budget allocation', 'allocated budget'
  ],
  'total_expenditure': [
    'total expenditure', 'expenditure', 'spent', 'total spent',
    'amount spent', 'disbursement', 'disbursed', 'actual expenditure',
    'actual spent', 'payments', 'total payments', 'total disbursed'
  ],
  'contract_awarded_date': [
    'contract awarded date', 'award date', 'awarded', 'date awarded',
    'contract date', 'awarded date', 'date of award', 'signing date'
  ],
  'agreement_start_date': [
    'agreement to start date', 'start date', 'commencement date',
    'begin date', 'project start', 'start', 'commenced', 'commencement',
    'date commenced', 'starting date', 'effective date'
  ],
  'expected_end_date': [
    'expected end date', 'end date', 'completion date', 'expected completion',
    'due date', 'deadline', 'target completion', 'scheduled completion',
    'planned completion', 'finish date', 'target end', 'project end'
  ],
  'duration_months': [
    'project duration', 'duration', 'duration (months)', 'months', 'period',
    'contract duration', 'duration months', 'time', 'contract period'
  ],
  'project_year': [
    'project year', 'year', 'fiscal year', 'fy', 'budget year'
  ],
  'project_month': [
    'project month', 'month', 'period month', 'reporting month', 'report month'
  ],
  'remarks': [
    'remarks', 'notes', 'comments', 'observation', 'remark', 'comment',
    'observations', 'issues', 'challenges', 'updates', 'status remarks'
  ]
};

export interface ProjectRow {
  project_reference: string;
  sub_agency: string | null;
  project_name: string;
  region: string | null;
  contract_value: number | null;
  contractor: string | null;
  completion_percent: number | null;
  project_status: string | null;
  allocated_balance: number | null;
  total_expenditure: number | null;
  contract_awarded_date: string | null;
  agreement_start_date: string | null;
  expected_end_date: string | null;
  duration_months: number | null;
  project_year: number | null;
  project_month: string | null;
  remarks: string | null;
}

export interface DataQualityReport {
  total_projects: number;
  missing_completion_percent: number;
  missing_contractor: number;
  missing_region: number;
  missing_contract_value: number;
  missing_status: number;
  projects_without_completion: string[];
  projects_without_contractor: string[];
}

export interface ParseResult {
  projects: ProjectRow[];
  dataQuality: DataQualityReport;
  debug: {
    sheetNames: string[];
    headerRow: number;
    headers: string[];
    mappedColumns: Record<string, number>;
    totalRows: number;
    sampleData: any[];
  };
}

export function parseProjectsExcel(buffer: Buffer): ProjectRow[] {
  const result = parseProjectsExcelWithDebug(buffer);
  return result.projects;
}

export function parseProjectsExcelWithDebug(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  // Try each sheet until we find data
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];

    if (!rawData || rawData.length < 2) continue;

    // Find header row - look for the first row with multiple non-empty cells
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(20, rawData.length); i++) {
      const row = rawData[i];
      if (!row) continue;

      // Count non-empty cells
      const nonEmptyCells = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;

      if (nonEmptyCells >= 5) {
        // Check if this looks like a header row (has text, not just numbers)
        const hasTextCells = row.filter(c => {
          const val = String(c || '');
          return val && isNaN(Number(val.replace(/[$,%]/g, '')));
        }).length;

        if (hasTextCells >= 3) {
          headerRowIndex = i;
          break;
        }
      }
    }

    if (headerRowIndex === -1) continue;

    const headers = (rawData[headerRowIndex] || []) as string[];
    const columnMap = mapColumns(headers);

    console.log('Mapped columns:', columnMap);
    console.log('Headers found:', headers.slice(0, 20));

    // If no specific columns found, create a generic mapping
    if (Object.keys(columnMap).length === 0) {
      for (let i = 0; i < headers.length; i++) {
        if (headers[i] && String(headers[i]).trim()) {
          if (columnMap.project_reference === undefined) {
            columnMap.project_reference = i;
          } else if (columnMap.project_name === undefined) {
            columnMap.project_name = i;
            break;
          }
        }
      }
    }

    // If still no project_reference, use first column
    if (columnMap.project_reference === undefined) {
      columnMap.project_reference = 0;
    }

    // If no project_name, use second column or same as reference
    if (columnMap.project_name === undefined) {
      columnMap.project_name = headers.length > 1 ? 1 : columnMap.project_reference;
    }

    // Parse data rows
    const projects: ProjectRow[] = [];
    const sampleData: any[] = [];

    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row) continue;

      // Collect sample data for first few rows
      if (sampleData.length < 3) {
        const sample: Record<string, any> = {};
        for (const [field, colIndex] of Object.entries(columnMap)) {
          sample[field] = row[colIndex];
        }
        sampleData.push(sample);
      }

      // Get the reference value
      let refValue = row[columnMap.project_reference];

      // Skip empty rows
      if (!refValue || String(refValue).trim() === '') {
        const firstNonEmpty = row.find(c => c !== null && c !== undefined && String(c).trim() !== '');
        if (!firstNonEmpty) continue;
        refValue = firstNonEmpty;
      }

      const projectRef = String(refValue).trim();

      // Skip summary/total rows
      const lowerRef = projectRef.toLowerCase();
      if (!projectRef ||
          lowerRef === 'total' ||
          lowerRef === 'grand total' ||
          lowerRef.startsWith('total ') ||
          lowerRef.includes('subtotal') ||
          lowerRef.includes('sub-total')) {
        continue;
      }

      // Create a unique reference if it's just a number or generic
      const uniqueRef = projectRef.length < 3 ? `${sheetName}-${i}-${projectRef}` : projectRef;

      // Extract agency from project reference
      const extractedAgency = extractAgencyFromReference(uniqueRef);

      // Get project name - be more aggressive in finding it
      let projectName = getStringValue(row, columnMap.project_name);
      if (!projectName || projectName === projectRef) {
        // Try to find a longer text field that could be the name
        for (let j = 0; j < row.length; j++) {
          if (j === columnMap.project_reference) continue;
          const val = String(row[j] || '').trim();
          if (val.length > 20 && isNaN(Number(val.replace(/[$,%]/g, '')))) {
            projectName = val;
            break;
          }
        }
      }

      // Parse completion percent - handle various formats
      const completionPercent = parsePercent(row[columnMap.completion_percent]);

      // Parse contractor - clean up the value
      let contractor = getStringValue(row, columnMap.contractor);
      if (contractor) {
        // Clean up contractor name
        contractor = contractor.replace(/\s+/g, ' ').trim();
      }

      // Parse region
      const region = getStringValue(row, columnMap.region);

      projects.push({
        project_reference: uniqueRef,
        sub_agency: extractedAgency || getStringValue(row, columnMap.sub_agency),
        project_name: toTitleCase(projectName || projectRef),
        region: formatRegion(region),
        contract_value: parseCurrency(row[columnMap.contract_value]),
        contractor: formatContractorName(contractor),
        completion_percent: completionPercent,
        project_status: formatStatus(getStringValue(row, columnMap.project_status)),
        allocated_balance: parseCurrency(row[columnMap.allocated_balance]),
        total_expenditure: parseCurrency(row[columnMap.total_expenditure]),
        contract_awarded_date: parseDate(row[columnMap.contract_awarded_date]),
        agreement_start_date: parseDate(row[columnMap.agreement_start_date]),
        expected_end_date: parseDate(row[columnMap.expected_end_date]),
        duration_months: parseNumber(row[columnMap.duration_months]),
        project_year: parseNumber(row[columnMap.project_year]),
        project_month: getStringValue(row, columnMap.project_month),
        remarks: toTitleCase(getStringValue(row, columnMap.remarks))
      });
    }

    if (projects.length > 0) {
      // Generate data quality report
      const dataQuality = generateDataQualityReport(projects);

      return {
        projects,
        dataQuality,
        debug: {
          sheetNames: workbook.SheetNames,
          headerRow: headerRowIndex,
          headers: headers.map(h => String(h || '')),
          mappedColumns: columnMap,
          totalRows: rawData.length,
          sampleData
        }
      };
    }
  }

  // No data found in any sheet
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

  return {
    projects: [],
    dataQuality: {
      total_projects: 0,
      missing_completion_percent: 0,
      missing_contractor: 0,
      missing_region: 0,
      missing_contract_value: 0,
      missing_status: 0,
      projects_without_completion: [],
      projects_without_contractor: []
    },
    debug: {
      sheetNames: workbook.SheetNames,
      headerRow: -1,
      headers: rawData[0]?.map(h => String(h || '')) || [],
      mappedColumns: {},
      totalRows: rawData.length,
      sampleData: []
    }
  };
}

function generateDataQualityReport(projects: ProjectRow[]): DataQualityReport {
  const missingCompletion = projects.filter(p => p.completion_percent === null);
  const missingContractor = projects.filter(p => !p.contractor);
  const missingRegion = projects.filter(p => !p.region);
  const missingValue = projects.filter(p => p.contract_value === null);
  const missingStatus = projects.filter(p => !p.project_status);

  return {
    total_projects: projects.length,
    missing_completion_percent: missingCompletion.length,
    missing_contractor: missingContractor.length,
    missing_region: missingRegion.length,
    missing_contract_value: missingValue.length,
    missing_status: missingStatus.length,
    projects_without_completion: missingCompletion.slice(0, 10).map(p => p.project_reference),
    projects_without_contractor: missingContractor.slice(0, 10).map(p => p.project_reference)
  };
}

function getStringValue(row: any[], index: number | undefined): string | null {
  if (index === undefined) return null;
  const val = row[index];
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).trim();
  // Return null for placeholder values
  if (str === '-' || str === 'N/A' || str === 'n/a' || str === 'NA' || str === 'TBD') return null;
  return str || null;
}

// Known agency codes
const KNOWN_AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'MOPUA', 'HAS'];

function extractAgencyFromReference(reference: string): string | null {
  if (!reference) return null;

  const upperRef = reference.toUpperCase();
  for (const agency of KNOWN_AGENCIES) {
    if (upperRef.startsWith(agency)) {
      return agency;
    }
  }

  // Fallback: extract letters before XX or numbers
  const match = upperRef.match(/^([A-Z]+?)(?:XX|X?\d)/);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

function mapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const usedColumns = new Set<number>();

  // First pass: exact matches only
  for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
    for (let i = 0; i < headers.length; i++) {
      if (usedColumns.has(i)) continue;
      const header = String(headers[i] || '').toLowerCase().trim();
      if (aliases.some(alias => header === alias.toLowerCase())) {
        map[field] = i;
        usedColumns.add(i);
        break;
      }
    }
  }

  // Second pass: partial matches for unmapped fields (prefer longer matches)
  for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
    if (map[field] !== undefined) continue;

    let bestMatch = -1;
    let bestMatchLength = 0;

    for (let i = 0; i < headers.length; i++) {
      if (usedColumns.has(i)) continue;
      const header = String(headers[i] || '').toLowerCase().trim();

      for (const alias of aliases) {
        const lowerAlias = alias.toLowerCase();
        if (header.includes(lowerAlias) && lowerAlias.length > bestMatchLength) {
          bestMatch = i;
          bestMatchLength = lowerAlias.length;
        }
      }
    }

    if (bestMatch !== -1) {
      map[field] = bestMatch;
      usedColumns.add(bestMatch);
    }
  }

  return map;
}

function parseCurrency(value: any): number | null {
  if (value === null || value === undefined || value === '-' || value === '' || value === 'N/A') return null;
  const str = String(value).replace(/[$,GYD\s]/gi, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parsePercent(value: any): number | null {
  if (value === null || value === undefined || value === '-' || value === '' || value === 'N/A') return null;

  // Handle if it's already a number (Excel might return decimals like 0.75 for 75%)
  if (typeof value === 'number') {
    // If it's a decimal less than or equal to 1, multiply by 100
    if (value > 0 && value <= 1) {
      return Math.round(value * 100);
    }
    // If it's between 1 and 100, use as-is
    if (value > 1 && value <= 100) {
      return Math.round(value);
    }
    // If it's greater than 100, it might be invalid or already a percentage
    return value <= 100 ? Math.round(value) : null;
  }

  // Handle string values
  const str = String(value).trim();
  const num = parseFloat(str.replace('%', '').trim());

  if (isNaN(num)) return null;

  // Same logic for parsed numbers
  if (num > 0 && num <= 1) {
    return Math.round(num * 100);
  }
  if (num >= 0 && num <= 100) {
    return Math.round(num);
  }

  return null;
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '-' || value === '') return null;
  const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? null : Math.round(num);
}

function parseDate(value: any): string | null {
  if (!value || value === '-' || value === 'N/A') return null;

  // If it's already a Date object
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().split('T')[0];
  }

  // Try parsing as date
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    // Try parsing common date formats
    const str = String(value).trim();
    const formats = [
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY or DD/MM/YYYY
      /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
    ];

    for (const format of formats) {
      const match = str.match(format);
      if (match) {
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
      }
    }
    return null;
  }

  // Avoid returning dates like 1970-01-01 from invalid parses
  if (date.getFullYear() < 1990) return null;

  return date.toISOString().split('T')[0];
}
