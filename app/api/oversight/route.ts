import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const HIGHLIGHTS_PATH = path.join(process.cwd(), 'scraper', 'output', 'oversight-highlights-latest.json');

const REGION_NAMES: Record<string, string> = {
  '01': 'Region 1 – Barima-Waini',
  '02': 'Region 2 – Pomeroon-Supenaam',
  '03': 'Region 3 – Essequibo Islands-West Demerara',
  '04': 'Region 4 – Demerara-Mahaica',
  '05': 'Region 5 – Mahaica-Berbice',
  '06': 'Region 6 – East Berbice-Corentyne',
  '07': 'Region 7 – Cuyuni-Mazaruni',
  '08': 'Region 8 – Potaro-Siparuni',
  '09': 'Region 9 – Upper Takutu-Upper Essequibo',
  '10': 'Region 10 – Upper Demerara-Berbice',
};

function formatCurrency(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

// Normalize a project object so the frontend always gets standardized field names,
// regardless of whether the scraper output uses raw or standardized keys.
function normalizeProject(raw: any): any {
  // Already standardized (has 'name' field) — pass through
  if (raw.name !== undefined) return raw;

  const contractValue = raw.contractValue ?? null;
  const completion = raw.completionPercent ?? null;
  const regionCode = raw.region ?? null;

  return {
    ...raw,
    id: raw.p3Id || null,
    reference: raw.projectReference || null,
    name: raw.projectName || null,
    agency: raw.subAgency || raw.executingAgency || null,
    region: REGION_NAMES[regionCode] || regionCode,
    contractor: raw.contractors || null,
    contractValue,
    contractValueDisplay: raw.contractValueRaw || formatCurrency(contractValue),
    completion,
    endDate: raw.projectEndDate || null,
  };
}

function normalizeArray(arr: any[]): any[] {
  return Array.isArray(arr) ? arr.map(normalizeProject) : [];
}

export async function GET() {
  try {
    if (!fs.existsSync(HIGHLIGHTS_PATH)) {
      return NextResponse.json(
        { success: false, error: 'No scrape data found. Run the scraper first.' },
        { status: 404 }
      );
    }

    const raw = fs.readFileSync(HIGHLIGHTS_PATH, 'utf-8');
    const data = JSON.parse(raw);

    // Normalize project arrays so the frontend gets consistent field names
    data.overdue = normalizeArray(data.overdue);
    data.delayed = normalizeArray(data.delayed);
    data.endingSoon = normalizeArray(data.endingSoon);
    data.atRisk = normalizeArray(data.atRisk);
    data.bondWarnings = normalizeArray(data.bondWarnings);
    data.top10 = normalizeArray(data.top10);

    // Normalize agencyBreakdown field names (scraper may use totalContractValue)
    if (Array.isArray(data.agencyBreakdown)) {
      data.agencyBreakdown = data.agencyBreakdown.map((a: any) => ({
        agency: a.agency || null,
        agencyFull: a.agencyFull || null,
        projectCount: a.projectCount ?? 0,
        totalValue: a.totalValue ?? a.totalContractValue ?? 0,
        totalValueDisplay: a.totalValueDisplay || formatCurrency(a.totalValue ?? a.totalContractValue ?? null),
        avgCompletion: a.avgCompletion ?? null,
      }));
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
