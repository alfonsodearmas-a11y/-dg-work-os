import { supabaseAdmin } from '@/lib/db';
import type { ReferralSourceType, ReferralStatus } from './types';

export interface ActiveReferralBrief {
  reference_number: string;
  status: ReferralStatus;
  submitted_at: string;
}

export async function getActiveReferralForSource(
  sourceType: ReferralSourceType,
  sourceId: string,
): Promise<ActiveReferralBrief | null> {
  const { data, error } = await supabaseAdmin
    .from('ministerial_referrals')
    .select('reference_number, status, submitted_at')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .not('status', 'in', '(drafted,closed)')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.reference_number || !data.submitted_at) return null;
  return {
    reference_number: data.reference_number,
    status: data.status,
    submitted_at: data.submitted_at,
  };
}

export async function getActiveReferralsForSources(
  sourceType: ReferralSourceType,
  sourceIds: string[],
): Promise<Map<string, ActiveReferralBrief>> {
  const out = new Map<string, ActiveReferralBrief>();
  if (sourceIds.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from('ministerial_referrals')
    .select('source_id, reference_number, status, submitted_at')
    .eq('source_type', sourceType)
    .in('source_id', sourceIds)
    .not('status', 'in', '(drafted,closed)')
    .order('submitted_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  for (const row of data ?? []) {
    if (!row.source_id || !row.reference_number || !row.submitted_at) continue;
    if (out.has(row.source_id)) continue;
    out.set(row.source_id, {
      reference_number: row.reference_number,
      status: row.status,
      submitted_at: row.submitted_at,
    });
  }
  return out;
}
