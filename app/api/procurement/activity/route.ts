import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';

export type ActivityType = 'field_change' | 'presence' | 'decision';

export interface ActivityItem {
  type: ActivityType;
  id: string;
  at: string;
  agency: string;
  tender_id: string | null;
  tender_description: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  // type-specific
  field_name?: string;
  old_value?: unknown;
  new_value?: unknown;
  event_type?: string;
  decision_type?: string;
  reason_code?: string | null;
  reason_text?: string | null;
}

const PER_SOURCE_LIMIT = 200;
const COMBINED_LIMIT = 200;

export async function GET(request: Request) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || String(COMBINED_LIMIT), 10), 500);

  const isMinistry = (session.user.role) === 'superadmin';
  const agencyFilter = isMinistry ? null : session.user.agency?.toUpperCase() ?? null;

  try {
    const [fieldRes, presenceRes, decisionRes] = await Promise.all([
      supabaseAdmin
        .from('tender_field_change')
        .select('id, tender_id, field_name, old_value, new_value, changed_at, changed_by')
        // sentinels are no longer written but legacy rows remain — drop them
        .not('field_name', 'in', '(__created,__presence)')
        .order('changed_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT),
      (() => {
        let q = supabaseAdmin
          .from('tender_presence_event')
          .select('id, tender_id, event_type, agency, upload_id, actor_id, actor_role, at')
          .order('at', { ascending: false })
          .limit(PER_SOURCE_LIMIT);
        if (agencyFilter) q = q.eq('agency', agencyFilter);
        return q;
      })(),
      (() => {
        let q = supabaseAdmin
          .from('procurement_decision')
          .select('id, decision_type, target_kind, target_id, agency, actor_id, actor_role, reason_code, reason_text, decided_at')
          .order('decided_at', { ascending: false })
          .limit(PER_SOURCE_LIMIT);
        if (agencyFilter) q = q.eq('agency', agencyFilter);
        return q;
      })(),
    ]);
    if (fieldRes.error) throw fieldRes.error;
    if (presenceRes.error) throw presenceRes.error;
    if (decisionRes.error) throw decisionRes.error;

    const tenderIds = new Set<string>();
    for (const f of fieldRes.data || []) tenderIds.add(f.tender_id as string);
    for (const p of presenceRes.data || []) tenderIds.add(p.tender_id as string);
    for (const d of decisionRes.data || []) {
      if (d.target_kind === 'tender') tenderIds.add(d.target_id as string);
    }

    const reviewIds = new Set<string>();
    for (const d of decisionRes.data || []) {
      if (d.target_kind === 'review_row') reviewIds.add(d.target_id as string);
    }

    const actorIds = new Set<string>();
    for (const f of fieldRes.data || []) if (f.changed_by) actorIds.add(f.changed_by as string);
    for (const p of presenceRes.data || []) if (p.actor_id) actorIds.add(p.actor_id as string);
    for (const d of decisionRes.data || []) actorIds.add(d.actor_id as string);

    const [tendersRes, reviewsRes, actorsRes] = await Promise.all([
      tenderIds.size
        ? supabaseAdmin.from('tender').select('id, description, agency').in('id', Array.from(tenderIds))
        : Promise.resolve({ data: [], error: null }),
      reviewIds.size
        ? supabaseAdmin.from('tender_match_review').select('id, incoming_row').in('id', Array.from(reviewIds))
        : Promise.resolve({ data: [], error: null }),
      actorIds.size
        ? supabaseAdmin.from('users').select('id, name').in('id', Array.from(actorIds))
        : Promise.resolve({ data: [], error: null }),
    ]);

    const tenderById = new Map<string, { description: string; agency: string }>();
    for (const t of tendersRes.data || []) {
      tenderById.set(t.id as string, { description: t.description as string, agency: t.agency as string });
    }
    const reviewById = new Map<string, string | null>();
    for (const r of reviewsRes.data || []) {
      const inc = r.incoming_row as Record<string, unknown> | null;
      reviewById.set(r.id as string, (inc?.description as string) ?? null);
    }
    const actorById = new Map<string, string>();
    for (const a of actorsRes.data || []) actorById.set(a.id as string, (a.name as string) ?? null);

    const items: ActivityItem[] = [];

    for (const f of fieldRes.data || []) {
      const t = tenderById.get(f.tender_id as string);
      if (!t) continue;
      if (agencyFilter && t.agency.toUpperCase() !== agencyFilter) continue;
      items.push({
        type: 'field_change',
        id: f.id as string,
        at: f.changed_at as string,
        agency: t.agency,
        tender_id: f.tender_id as string,
        tender_description: t.description,
        actor_id: (f.changed_by as string) ?? null,
        actor_name: f.changed_by ? actorById.get(f.changed_by as string) ?? null : null,
        actor_role: null,
        field_name: f.field_name as string,
        old_value: f.old_value,
        new_value: f.new_value,
      });
    }

    for (const p of presenceRes.data || []) {
      const t = tenderById.get(p.tender_id as string);
      items.push({
        type: 'presence',
        id: p.id as string,
        at: p.at as string,
        agency: p.agency as string,
        tender_id: p.tender_id as string,
        tender_description: t?.description ?? null,
        actor_id: (p.actor_id as string) ?? null,
        actor_name: p.actor_id ? actorById.get(p.actor_id as string) ?? null : null,
        actor_role: (p.actor_role as string) ?? null,
        event_type: p.event_type as string,
      });
    }

    for (const d of decisionRes.data || []) {
      const tenderLabel =
        d.target_kind === 'tender'
          ? tenderById.get(d.target_id as string)?.description ?? null
          : reviewById.get(d.target_id as string) ?? null;
      items.push({
        type: 'decision',
        id: d.id as string,
        at: d.decided_at as string,
        agency: d.agency as string,
        tender_id: d.target_kind === 'tender' ? (d.target_id as string) : null,
        tender_description: tenderLabel,
        actor_id: d.actor_id as string,
        actor_name: actorById.get(d.actor_id as string) ?? null,
        actor_role: d.actor_role as string,
        decision_type: d.decision_type as string,
        reason_code: (d.reason_code as string) ?? null,
        reason_text: (d.reason_text as string) ?? null,
      });
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return NextResponse.json({ items: items.slice(0, limit) });
  } catch (err) {
    logger.error({ err }, 'Error fetching procurement activity feed');
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
  }
}
