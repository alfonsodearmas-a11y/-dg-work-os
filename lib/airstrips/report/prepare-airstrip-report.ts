// Data-gather for the per-airstrip PDF report. Deliberately split from the
// renderer (lib/pdf/airstrip-report-render.tsx) so a future network-wide rollup
// can reuse the same data shape. Photos are embedded as raw bytes via
// storage.download() — no URL layer (the bucket is private; see Phase 0).

import { supabaseAdmin } from '@/lib/db';
import { guyanaToday, addDays, quarterFromISODate } from '@/lib/airstrip-types';
import { getAirstripSettings, augmentAirstrip, type AirstripOverviewRow } from '@/lib/airstrips/queries';
import type { AirstripCadence } from '@/lib/airstrips/warnings';

const BUCKET = 'airstrip-photos';

export interface ReportPhoto { data: Buffer; format: 'png' | 'jpg'; caption: string | null }

export interface ReportMaintenanceEntry {
  performed_date: string;
  activity_type: string;
  activity_description: string | null;
  contractor_name: string | null;
  verification_method: string;
  verified: boolean;
  verified_at: string | null;
  quarter: string | null;
  notes: string | null;
  photos: ReportPhoto[];
}

export interface ReportTrendPoint { quarter: string; activities: number; verified: number }

export interface AirstripReportData {
  airstrip: {
    id: string; name: string; region: number; status: string;
    surface_type: string | null; surface_condition: string | null;
    runway_length_m: number | null; runway_width_m: number | null;
    coordinates_lat: number | null; coordinates_lon: number | null;
    last_inspection_date: string | null;
  };
  responsibility: { contractorName: string | null; managerName: string | null };
  cadence: AirstripCadence;
  intervalDays: number;
  range: { from: string; to: string };
  maintenance: ReportMaintenanceEntry[];
  inspections: Record<string, unknown>[];
  trend: ReportTrendPoint[];
  hasPaymentModel: boolean;   // payment section is conditional; no payment model yet
  generatedAt: string;
}

/** Resolve the report window. Defaults to the last 12 months (Guyana local). */
export function resolveReportRange(from?: string | null, to?: string | null): { from: string; to: string } {
  const isISO = (s?: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const end = isISO(to) ? to : guyanaToday();
  const start = isISO(from) ? from : addDays(end, -365);
  return { from: start, to: end };
}

const quarterSortKey = (label: string): number => {
  const m = /^Q(\d) (\d{4})$/.exec(label);
  return m ? Number(m[2]) * 10 + Number(m[1]) : 0;
};

/** Group maintenance into a chronological per-quarter activity/verified trend. */
export function buildTrend(maintenance: { performed_date: string; verified: boolean }[]): ReportTrendPoint[] {
  const map = new Map<string, ReportTrendPoint>();
  for (const m of maintenance) {
    const quarter = quarterFromISODate(m.performed_date);
    if (!quarter) continue;
    const e = map.get(quarter) ?? { quarter, activities: 0, verified: 0 };
    e.activities += 1;
    if (m.verified) e.verified += 1;
    map.set(quarter, e);
  }
  return [...map.values()].sort((a, b) => quarterSortKey(a.quarter) - quarterSortKey(b.quarter));
}

/** Only PNG/JPEG embed in @react-pdf's <Image data>; WebP/others are skipped. */
export function photoFormat(fileName: string | null, blobType?: string): 'png' | 'jpg' | null {
  const t = (blobType || '').toLowerCase();
  const n = (fileName || '').toLowerCase();
  if (t.includes('png') || n.endsWith('.png')) return 'png';
  if (t.includes('jpeg') || t.includes('jpg') || n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg';
  return null;
}

export async function prepareAirstripReport(
  airstripId: string,
  fromParam?: string | null,
  toParam?: string | null,
): Promise<AirstripReportData | null> {
  const range = resolveReportRange(fromParam, toParam);

  const [overviewRes, settings] = await Promise.all([
    supabaseAdmin.from('airstrip_overview').select('*').eq('id', airstripId).single(),
    getAirstripSettings(),
  ]);
  if (overviewRes.error || !overviewRes.data) return null;
  const a = augmentAirstrip(overviewRes.data as AirstripOverviewRow, settings);

  const [maintRes, inspRes] = await Promise.all([
    supabaseAdmin
      .from('airstrip_maintenance_log').select('*')
      .eq('airstrip_id', airstripId)
      .gte('performed_date', range.from).lte('performed_date', range.to)
      .order('performed_date', { ascending: false }),
    supabaseAdmin
      .from('airstrip_inspections').select('*')
      .eq('airstrip_id', airstripId)
      .gte('inspection_date', range.from).lte('inspection_date', range.to)
      .order('inspection_date', { ascending: false }),
  ]);

  const logs = (maintRes.data ?? []) as Record<string, unknown>[];

  const maintenance: ReportMaintenanceEntry[] = [];
  for (const log of logs) {
    const { data: photoRows } = await supabaseAdmin
      .from('airstrip_photos').select('storage_path, file_name, caption')
      .eq('maintenance_log_id', log.id as string);

    const photos: ReportPhoto[] = [];
    for (const pr of (photoRows ?? []) as { storage_path: string; file_name: string | null; caption: string | null }[]) {
      const format = photoFormat(pr.file_name);
      if (!format) continue;  // skip non-embeddable formats (e.g. webp)
      const { data: blob, error } = await supabaseAdmin.storage.from(BUCKET).download(pr.storage_path);
      if (error || !blob) continue;
      photos.push({ data: Buffer.from(await blob.arrayBuffer()), format, caption: pr.caption });
    }

    maintenance.push({
      performed_date: log.performed_date as string,
      activity_type: log.activity_type as string,
      activity_description: (log.activity_description as string) ?? null,
      contractor_name: (log.contractor_name as string) ?? null,
      verification_method: log.verification_method as string,
      verified: !!log.verified,
      verified_at: (log.verified_at as string) ?? null,
      quarter: (log.quarter as string) ?? null,
      notes: (log.notes as string) ?? null,
      photos,
    });
  }

  return {
    airstrip: {
      id: a.id, name: a.name, region: a.region as number, status: a.status as string,
      surface_type: (a.surface_type as string) ?? null,
      surface_condition: (a.surface_condition as string) ?? null,
      runway_length_m: (a.runway_length_m as number) ?? null,
      runway_width_m: (a.runway_width_m as number) ?? null,
      coordinates_lat: (a.coordinates_lat as number) ?? null,
      coordinates_lon: (a.coordinates_lon as number) ?? null,
      last_inspection_date: (a.last_inspection_date as string) ?? null,
    },
    responsibility: { contractorName: a.responsibility.contractorName, managerName: a.responsibility.managerName },
    cadence: a.cadence,
    intervalDays: a.intervalDays,
    range,
    maintenance,
    inspections: (inspRes.data ?? []) as Record<string, unknown>[],
    trend: buildTrend(logs.map(l => ({ performed_date: l.performed_date as string, verified: !!l.verified }))),
    hasPaymentModel: false,
    generatedAt: guyanaToday(),
  };
}
