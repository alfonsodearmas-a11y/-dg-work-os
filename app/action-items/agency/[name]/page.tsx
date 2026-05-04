import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EmptyShell } from '@/components/action-items/EmptyShell';
import { AGENCIES } from '@/lib/action-items/constants';

export default async function AgencyActionItemsPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { name } = await params;
  const isValid = (AGENCIES as readonly string[]).includes(name);

  return (
    <EmptyShell
      title={isValid ? `${name} — Action Items` : 'Unknown agency'}
      subtitle={
        isValid
          ? 'Per-agency view. Item rendering lands in Plan 2.'
          : `Recognized agencies: ${AGENCIES.join(', ')}`
      }
    />
  );
}
