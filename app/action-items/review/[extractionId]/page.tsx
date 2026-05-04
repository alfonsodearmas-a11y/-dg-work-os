import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { EmptyShell } from '@/components/action-items/EmptyShell';

const MINISTRY_ROLES = new Set(['dg', 'ps', 'parl_sec']);

export default async function ReviewExtractionPage({
  params,
}: {
  params: Promise<{ extractionId: string }>;
}) {
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

  const { extractionId } = await params;

  return (
    <EmptyShell
      title="Review extraction"
      subtitle={`Extraction ID: ${extractionId}. Three-bucket review UI lands in Plan 4.`}
    />
  );
}
