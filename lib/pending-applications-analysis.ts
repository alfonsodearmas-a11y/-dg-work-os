import type {
  PendingApplication,
  GPLAnalysis,
  GPLPipelineStage,
  GWIAnalysis,
  GWIRegionBreakdown,
  GWICommunityCluster,
  AgingBucket,
} from './pending-applications-types';

// ── GPL Analysis ─────────────────────────────────────────────────────────────

const GPL_SLA: Record<string, number> = {
  Metering: 3,
  Designs: 12,
  Execution: 26,
  Survey: 7,
  Estimation: 5,
  Approval: 3,
  Other: 14,
};

const GPL_AGING_BUCKETS: [string, number, number | null][] = [
  ['0–3 days', 0, 3],
  ['4–12 days', 4, 12],
  ['13–26 days', 13, 26],
  ['27–60 days', 27, 60],
  ['61–180 days', 61, 180],
  ['180+ days', 181, null],
];

export function computeGPLAnalysis(records: PendingApplication[]): GPLAnalysis {
  // Pipeline funnel with SLA compliance
  const stageMap = new Map<string, { records: PendingApplication[]; totalDays: number; maxDays: number }>();
  for (const r of records) {
    const stage = r.pipelineStage || 'Other';
    const entry = stageMap.get(stage) || { records: [], totalDays: 0, maxDays: 0 };
    entry.records.push(r);
    entry.totalDays += r.daysWaiting;
    entry.maxDays = Math.max(entry.maxDays, r.daysWaiting);
    stageMap.set(stage, entry);
  }

  const pipeline: GPLPipelineStage[] = Array.from(stageMap.entries()).map(([stage, d]) => {
    const slaDays = GPL_SLA[stage] || 14;
    const slaCompliant = d.records.filter(r => r.daysWaiting <= slaDays).length;
    const slaBreached = d.records.length - slaCompliant;
    return {
      stage,
      count: d.records.length,
      avgDays: Math.round(d.totalDays / d.records.length),
      maxDays: d.maxDays,
      slaDays,
      slaCompliant,
      slaBreached,
      compliancePct: d.records.length > 0 ? Math.round((slaCompliant / d.records.length) * 100) : 100,
    };
  }).sort((a, b) => b.count - a.count);

  // 6-tier aging buckets
  const agingBuckets = buildAgingBuckets(records, GPL_AGING_BUCKETS);

  // Account type breakdown
  const acctMap = new Map<string, { count: number; totalDays: number }>();
  for (const r of records) {
    const type = r.accountType || r.eventDescription || 'Unknown';
    const entry = acctMap.get(type) || { count: 0, totalDays: 0 };
    entry.count++;
    entry.totalDays += r.daysWaiting;
    acctMap.set(type, entry);
  }
  const accountTypes = Array.from(acctMap.entries())
    .map(([type, d]) => ({ type, count: d.count, avgDays: Math.round(d.totalDays / d.count) }))
    .sort((a, b) => b.count - a.count);

  // Red flags
  const redFlags: string[] = [];
  const overallSlaBreached = pipeline.reduce((sum, s) => sum + s.slaBreached, 0);
  if (overallSlaBreached > records.length * 0.5) {
    redFlags.push(`${Math.round((overallSlaBreached / records.length) * 100)}% of orders exceed SLA targets`);
  }
  const over180 = records.filter(r => r.daysWaiting > 180);
  if (over180.length > 0) {
    redFlags.push(`${over180.length} applications waiting over 180 days`);
  }
  for (const stage of pipeline) {
    if (stage.compliancePct < 30) {
      redFlags.push(`${stage.stage} stage has only ${stage.compliancePct}% SLA compliance`);
    }
  }

  return {
    pipeline,
    agingBuckets,
    accountTypes,
    redFlags,
  };
}

// ── GWI Analysis ─────────────────────────────────────────────────────────────

const GWI_AGING_BUCKETS: [string, number, number | null][] = [
  ['0–7 days', 0, 7],
  ['8–14 days', 8, 14],
  ['15–30 days', 15, 30],
  ['31–60 days', 31, 60],
  ['60+ days', 61, null],
];

export function computeGWIAnalysis(records: PendingApplication[]): GWIAnalysis {
  // 5-tier aging buckets
  const agingBuckets = buildAgingBuckets(records, GWI_AGING_BUCKETS);

  // Regional distribution with district drill-down
  type RegionEntry = { records: PendingApplication[]; totalDays: number; maxDays: number; districts: Map<string, { count: number; totalDays: number }> };
  const regionMap = new Map<string, RegionEntry>();
  for (const r of records) {
    const region = r.region || 'Unknown';
    const district = r.district || 'Unknown';
    const entry: RegionEntry = regionMap.get(region) || { records: [], totalDays: 0, maxDays: 0, districts: new Map() };
    entry.records.push(r);
    entry.totalDays += r.daysWaiting;
    entry.maxDays = Math.max(entry.maxDays, r.daysWaiting);
    const distEntry = entry.districts.get(district) || { count: 0, totalDays: 0 };
    distEntry.count++;
    distEntry.totalDays += r.daysWaiting;
    entry.districts.set(district, distEntry);
    regionMap.set(region, entry);
  }

  const regions: GWIRegionBreakdown[] = Array.from(regionMap.entries())
    .map(([region, d]) => ({
      region,
      count: d.records.length,
      avgDays: Math.round(d.totalDays / d.records.length),
      maxDays: d.maxDays,
      districts: Array.from(d.districts.entries())
        .map(([district, dd]) => ({ district, count: dd.count, avgDays: Math.round(dd.totalDays / dd.count) }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);

  // Community clusters (villages with 5+ pending)
  const villageMap = new Map<string, { region: string; count: number; totalDays: number }>();
  for (const r of records) {
    const village = r.villageWard || r.district || '';
    if (!village) continue;
    const entry = villageMap.get(village) || { region: r.region || 'Unknown', count: 0, totalDays: 0 };
    entry.count++;
    entry.totalDays += r.daysWaiting;
    villageMap.set(village, entry);
  }
  const communityClusters: GWICommunityCluster[] = Array.from(villageMap.entries())
    .filter(([, d]) => d.count >= 5)
    .map(([village, d]) => ({ village, region: d.region, count: d.count, avgDays: Math.round(d.totalDays / d.count) }))
    .sort((a, b) => b.count - a.count);

  // Red flags
  const redFlags: string[] = [];
  const over60 = records.filter(r => r.daysWaiting > 60);
  if (over60.length > 0) {
    redFlags.push(`${over60.length} applications waiting over 60 days`);
  }
  const avgDays = records.length > 0 ? Math.round(records.reduce((s, r) => s + r.daysWaiting, 0) / records.length) : 0;
  if (avgDays > 30) {
    redFlags.push(`Average wait time is ${avgDays} days — exceeds 30-day target`);
  }
  if (communityClusters.length > 0) {
    const top = communityClusters[0];
    redFlags.push(`${top.village} has ${top.count} pending applications (avg ${top.avgDays}d wait)`);
  }
  for (const region of regions) {
    if (region.maxDays > 90) {
      redFlags.push(`${region.region} has applications waiting up to ${region.maxDays} days`);
    }
  }

  return { agingBuckets, regions, communityClusters, redFlags };
}

// ── Shared ───────────────────────────────────────────────────────────────────

function buildAgingBuckets(records: PendingApplication[], bucketDefs: [string, number, number | null][]): AgingBucket[] {
  const total = records.length || 1;
  return bucketDefs.map(([label, min, max]) => {
    const count = records.filter(r => r.daysWaiting >= min && (max === null || r.daysWaiting <= max)).length;
    return { label, min, max, count, pct: Math.round((count / total) * 100) };
  });
}
