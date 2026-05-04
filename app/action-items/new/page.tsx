import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EmptyShell } from '@/components/action-items/EmptyShell';

export default async function NewActionItemPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <EmptyShell
      title="New Action Item"
      subtitle="Freestanding manual-add form. Lands in Plan 2."
    />
  );
}
