import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db-admin';

export const dynamic = 'force-dynamic';
const ALLOWED = new Set(['superadmin']);

export default async function ReviewListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!ALLOWED.has(session.user.role)) {
    return <div className="card-premium p-12 text-center">Restricted to DG and Permanent Secretary.</div>;
  }
  const { data: rows } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, meeting_id, meeting_title, meeting_date, items_extracted, items_accepted, items_edited, items_rejected, review_status')
    .in('review_status', ['pending', 'in_review'])
    .order('meeting_date', { ascending: false });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="stat-number text-2xl">Review queue</h1>
        <Link href="/action-items/meetings" className="text-xs underline text-navy-600">Meetings →</Link>
      </div>
      {(rows ?? []).length === 0 && <div className="text-navy-600">Nothing to review.</div>}
      <ul className="space-y-2">
        {(rows ?? []).map(r => (
          <li key={r.id as string}>
            <Link href={`/action-items/review/${r.id}`}
              className="block bg-navy-900 border border-navy-800 rounded-lg p-3 hover:border-gold-500/40">
              <div className="text-sm text-white">{(r.meeting_title as string | null) ?? '(untitled)'}</div>
              <div className="text-xs text-navy-600">
                {r.meeting_date ? new Date(r.meeting_date as string).toLocaleString() : ''} ·
                {' '}{r.items_extracted as number} items · {r.items_accepted as number} accepted · {r.items_rejected as number} rejected
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="text-xs text-navy-600 mt-4">
        Need to (re-)extract a meeting? <Link href="/action-items/process" className="underline">Manual trigger →</Link>
      </div>
    </div>
  );
}
