import type { NptabReportTenderSnapshot } from './types';

export interface AgencyAggregate { agency: string; count: number; total_value: number; }
export interface ValueBracket { label: string; count: number; total_value: number; }
export interface ContractorAggregate { contractor: string; count: number; total_value: number; }

const BRACKETS: { label: string; min: number; max: number | null }[] = [
  { label: '< 10M',         min: 0,            max: 10_000_000 },
  { label: '10M to 50M',    min: 10_000_000,   max: 50_000_000 },
  { label: '50M to 200M',   min: 50_000_000,   max: 200_000_000 },
  { label: '200M+',         min: 200_000_000,  max: null },
];

export function buildAggregates(rows: NptabReportTenderSnapshot[]): {
  byAgency: AgencyAggregate[];
  byValueBracket: ValueBracket[];
  byContractor: ContractorAggregate[];
} {
  const agencyMap = new Map<string, AgencyAggregate>();
  for (const r of rows) {
    const a = agencyMap.get(r.agency) ?? { agency: r.agency, count: 0, total_value: 0 };
    a.count++;
    a.total_value += r.contract_value ?? 0;
    agencyMap.set(r.agency, a);
  }

  const bracketArr: ValueBracket[] = BRACKETS.map((b) => ({ label: b.label, count: 0, total_value: 0 }));
  for (const r of rows) {
    const v = r.contract_value ?? 0;
    const idx = BRACKETS.findIndex((b) => v >= b.min && (b.max === null || v < b.max));
    if (idx >= 0) {
      bracketArr[idx].count++;
      bracketArr[idx].total_value += v;
    }
  }

  const contractorMap = new Map<string, ContractorAggregate>();
  for (const r of rows) {
    if (!r.contractor) continue;
    const c = contractorMap.get(r.contractor) ?? { contractor: r.contractor, count: 0, total_value: 0 };
    c.count++;
    c.total_value += r.contract_value ?? 0;
    contractorMap.set(r.contractor, c);
  }

  return {
    byAgency: [...agencyMap.values()].sort((a, b) => b.count - a.count),
    byValueBracket: bracketArr,
    // Only contractors with 2+ tenders (per spec).
    byContractor: [...contractorMap.values()].filter((c) => c.count >= 2).sort((a, b) => b.total_value - a.total_value),
  };
}
