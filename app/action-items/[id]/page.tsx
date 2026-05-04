import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EmptyShell } from '@/components/action-items/EmptyShell';

export default async function ActionItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id } = await params;

  return (
    <EmptyShell
      title="Action Item detail"
      subtitle={`ID: ${id}. Detail rendering, event log, and supersession chain land in Plan 2.`}
    />
  );
}
