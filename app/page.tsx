import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getTodaySignals } from '@/lib/today/signals';
import { getSlaSummary } from '@/lib/today/sla-summary';
import { getCalendarToday } from '@/lib/today/schedule';
import { getTopOpenTasks } from '@/lib/today/top-tasks';
import { TodayView } from '@/components/today/TodayView';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id: userId, role, agency, name } = session.user;

  const [payload, sla, schedule, tasks] = await Promise.all([
    getTodaySignals(userId, role, agency),
    getSlaSummary(role, agency),
    getCalendarToday(userId),
    getTopOpenTasks(userId, role, agency, 3),
  ]);

  return (
    <TodayView
      payload={payload}
      sla={sla}
      schedule={schedule}
      tasks={tasks}
      userName={name ?? null}
    />
  );
}
