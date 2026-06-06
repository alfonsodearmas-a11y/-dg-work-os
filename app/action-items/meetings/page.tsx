import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { MeetingsList } from '@/components/action-items/MeetingsList';
import { DailyDigestCard } from '@/components/action-items/DailyDigestCard';
import { buildDailyDigest } from '@/lib/action-items/digest';
import type { MeetingRow } from '@/components/action-items/MeetingDetectionRow';

const ALLOWED = new Set(['superadmin']);
export const dynamic = 'force-dynamic';

export default async function MeetingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!ALLOWED.has(session.user.role)) {
    return <div className="card-premium p-12 text-center">Restricted to DG and Permanent Secretary.</div>;
  }

  const [{ data: rows }, summary] = await Promise.all([
    supabaseAdmin
      .from('meetings_seen')
      .select('id, fireflies_meeting_id, meeting_title, meeting_date, detected_type, detected_modality, pipeline_action, skip_reason')
      .order('meeting_date', { ascending: false })
      .limit(200),
    buildDailyDigest(),
  ]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="stat-number text-2xl">Meetings (Action Items pipeline)</h1>
          <p className="text-sm text-navy-600">
            Every Fireflies meeting the poller observed. Classify type + modality manually; Plan 4 extracts internal+virtual rows.
          </p>
        </div>
        <Link href="/action-items/review" className="text-xs underline text-navy-600">Review queue →</Link>
      </div>
      <DailyDigestCard summary={summary} />
      <MeetingsList rows={(rows ?? []) as unknown as MeetingRow[]} />
    </div>
  );
}
