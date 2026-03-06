import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getMissionControlData, generateStaticBriefing } from '@/lib/data/mission-control';
import { MissionControlView } from '@/components/mission-control/MissionControlView';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const data = await getMissionControlData(session.user.id);
  const briefing = generateStaticBriefing(data);

  return (
    <MissionControlView
      data={data}
      briefing={briefing}
      userName={session.user.name}
    />
  );
}
