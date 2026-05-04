import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EmptyShell } from '@/components/action-items/EmptyShell';

export default async function MyActionItemsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <EmptyShell
      title="My Action Items"
      subtitle="Items where you are the owner. Closure flow lands in Plan 2."
    />
  );
}
