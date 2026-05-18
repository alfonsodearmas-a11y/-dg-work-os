import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth-helpers';
import { getUpcomingPeriodLabel, listActiveQueue, listReports } from '@/lib/nptab/queries';
import { QueueSection } from './_components/QueueSection';
import { NptabReportsList } from './_components/NptabReportsList';

export const dynamic = 'force-dynamic';

export default async function NptabReportsPage() {
  const result = await requireRole(['dg', 'ps']);
  if (result instanceof NextResponse) notFound();
  const { session } = result;
  const [queue, reports] = await Promise.all([listActiveQueue(), listReports()]);
  const upcomingPeriodLabel = getUpcomingPeriodLabel();
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-white">NPTAB Reports</h1>
        <p className="text-sm text-navy-500">
          Procurement Performance Reports to the National Procurement and Tender Administration Board.
        </p>
      </header>
      <QueueSection queue={queue} upcomingPeriodLabel={upcomingPeriodLabel} canEdit={session.user.role === 'dg'} />
      <NptabReportsList reports={reports} />
    </div>
  );
}
