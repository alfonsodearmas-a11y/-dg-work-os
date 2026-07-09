import 'server-only';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db-admin';
import { VerificationQueueList, type AwaitingItem } from './VerificationQueueList';
import { PushbackQueueList, type PushbackEntry } from './PushbackQueueList';

export async function VerificationSurface() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'superadmin') return null;

  // 1) awaiting_verification items
  const { data: awaitingRaw } = await supabaseAdmin
    .from('tasks')
    .select('id, title, agency, owner_user_id, completion_note, completed_at, owner:users!owner_user_id(name)')
    .eq('status', 'awaiting_verification')
    .order('completed_at', { ascending: true })
    .limit(50);

  const awaiting: AwaitingItem[] = (awaitingRaw ?? []).map(r => ({
    id: r.id as string, title: r.title as string, agency: r.agency as string | null,
    owner_name: ((r as Record<string, unknown>).owner as { name?: string } | null)?.name ?? null,
    completion_note: r.completion_note as string | null,
    completed_at: r.completed_at as string | null,
  }));

  // 2) pushback queue
  const { data: candidates } = await supabaseAdmin
    .from('tasks')
    .select('id, title, agency, dispute_note, owner:users!owner_user_id(name)')
    .eq('status', 'active')
    .not('dispute_note', 'is', null)
    .limit(100);

  const ids = (candidates ?? []).map(c => c.id as string);
  const pushbacks: PushbackEntry[] = [];
  if (ids.length > 0) {
    const { data: events } = await supabaseAdmin
      .from('action_item_events')
      .select('task_id, event_type, payload, occurred_at')
      .in('task_id', ids)
      .order('occurred_at', { ascending: false });

    const latestDisputeRaised = new Map<string, string>();
    const latestPushback = new Map<string, { ts: string; text: string }>();
    for (const e of (events ?? []) as Array<{ task_id: string; event_type: string; payload: { action?: string; text?: string }; occurred_at: string }>) {
      if (e.event_type === 'dispute_raised') {
        const cur = latestDisputeRaised.get(e.task_id);
        if (!cur || cur < e.occurred_at) latestDisputeRaised.set(e.task_id, e.occurred_at);
      } else if (e.event_type === 'dispute_resolved' && e.payload?.action === 'pushback') {
        const cur = latestPushback.get(e.task_id);
        if (!cur || cur.ts < e.occurred_at) latestPushback.set(e.task_id, { ts: e.occurred_at, text: e.payload.text ?? '' });
      }
    }

    for (const c of candidates ?? []) {
      const id = c.id as string;
      const pb = latestPushback.get(id);
      if (!pb) continue;
      const redispute = latestDisputeRaised.get(id);
      if (redispute && redispute > pb.ts) continue;
      pushbacks.push({
        id, title: c.title as string, agency: c.agency as string | null,
        owner_name: ((c as Record<string, unknown>).owner as { name?: string } | null)?.name ?? null,
        dispute_note: c.dispute_note as string,
        pushback_text: pb.text,
        pushback_at: pb.ts,
      });
    }
  }

  if (awaiting.length === 0 && pushbacks.length === 0) return null;

  return (
    <div className="bg-navy-900/50 border border-gold-500/30 rounded-xl p-4 space-y-4">
      <VerificationQueueList items={awaiting} />
      <PushbackQueueList items={pushbacks} />
    </div>
  );
}
