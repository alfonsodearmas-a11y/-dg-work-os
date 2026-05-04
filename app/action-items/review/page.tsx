import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { EmptyShell } from '@/components/action-items/EmptyShell';

const MINISTRY_ROLES = new Set(['dg', 'ps', 'parl_sec']);

export default async function ReviewQueuePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!MINISTRY_ROLES.has(session.user.role)) {
    return (
      <EmptyShell
        title="Review queue"
        subtitle="Restricted to DG and Permanent Secretary."
      />
    );
  }

  return (
    <EmptyShell
      title="Review queue"
      subtitle="Meetings awaiting extraction review. Three-bucket review lands in Plan 4."
    />
  );
}
