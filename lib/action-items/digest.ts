import 'server-only';
import { supabaseAdmin } from '@/lib/db-admin';
import type { DriftFinding } from './matcher/drift';

export interface DigestSummary {
  date_range: { start: string; end: string };
  observed: number;
  extracted: number;
  queued: number;
  skipped: number;
  failed: number;
  by_type: Record<string, number>;
  by_modality: Record<string, number>;
  failed_extraction_count: number;
  drift_findings?: DriftFinding[];
}

export async function buildDailyDigest(asOf: Date = new Date()): Promise<DigestSummary> {
  const end = new Date(asOf); end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const { data: rows } = await supabaseAdmin
    .from('meetings_seen')
    .select('pipeline_action, detected_type, detected_modality')
    .gte('observed_at', start.toISOString())
    .lt('observed_at', end.toISOString());
  const observed = rows?.length ?? 0;

  const c = { extracted: 0, queued: 0, skipped: 0, failed: 0 };
  const by_type: Record<string, number> = {};
  const by_modality: Record<string, number> = {};
  for (const r of rows ?? []) {
    if (r.pipeline_action === 'extracted') c.extracted++;
    else if (r.pipeline_action === 'queued') c.queued++;
    else if (r.pipeline_action === 'skipped_out_of_scope') c.skipped++;
    else if (r.pipeline_action === 'failed') c.failed++;
    const t = r.detected_type ?? 'unclassified';
    const m = r.detected_modality ?? 'unclassified';
    by_type[t] = (by_type[t] ?? 0) + 1;
    by_modality[m] = (by_modality[m] ?? 0) + 1;
  }

  const { count: failedCount } = await supabaseAdmin
    .from('failed_extractions')
    .select('id', { count: 'exact', head: true })
    .gte('attempted_at', start.toISOString())
    .lt('attempted_at', end.toISOString());

  return {
    date_range: { start: start.toISOString(), end: end.toISOString() },
    observed,
    extracted: c.extracted, queued: c.queued, skipped: c.skipped, failed: c.failed,
    by_type, by_modality,
    failed_extraction_count: failedCount ?? 0,
  };
}

export function formatDigestBody(s: DigestSummary): string {
  const parts = [`${s.observed} meeting${s.observed === 1 ? '' : 's'} detected`];
  if (s.extracted > 0) parts.push(`${s.extracted} extracted`);
  if (s.queued > 0)    parts.push(`${s.queued} queued`);
  if (s.skipped > 0)   parts.push(`${s.skipped} skipped`);
  if (s.failed > 0)    parts.push(`${s.failed} failed`);
  return parts.join(' · ');
}
