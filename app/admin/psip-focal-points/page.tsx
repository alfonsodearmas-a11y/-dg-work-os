import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import FocalPointsClient from './FocalPointsClient';

export const dynamic = 'force-dynamic';

// DG-only. Non-DG users are redirected to home with no indication the page
// exists — intentional: the PSIP nag controls are not shown to the Minister,
// PS, or parl_sec, and there is no "access denied" surface to hint at them.
export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role !== 'superadmin') redirect('/');
  return <FocalPointsClient />;
}
