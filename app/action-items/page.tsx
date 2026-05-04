import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EmptyShell } from '@/components/action-items/EmptyShell';

export default async function ActionItemsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <EmptyShell
      title="Action Items"
      subtitle="The unified pipeline for tracking commitments across MPUA and the seven portfolio agencies. Coming online with Plan 2."
    />
  );
}
