import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import NagSettingsClient from './NagSettingsClient';

export const dynamic = 'force-dynamic';

// DG-only. See app/admin/psip-focal-points/page.tsx for the reasoning.
export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role !== 'dg') redirect('/');
  return <NagSettingsClient />;
}
