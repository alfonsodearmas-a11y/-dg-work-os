import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getTodaySignals } from '@/lib/today/signals';
import { TodayView } from '@/components/today/TodayView';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { role, agency } = session.user;
  const payload = await getTodaySignals(session.user.id, role, agency);

  return <TodayView payload={payload} userName={session.user.name} />;
}
