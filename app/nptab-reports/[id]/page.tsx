import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { getReportAuditLog, getReportById, getReportTenderSnapshots } from '@/lib/nptab/queries';
import { NptabReportDetailClient } from '../_components/NptabReportDetailClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NptabReportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await requireRole(['dg', 'ps']);
  if (result instanceof NextResponse) notFound();
  const { session } = result;

  const [report, tenders, audit] = await Promise.all([
    getReportById(id),
    getReportTenderSnapshots(id),
    getReportAuditLog(id),
  ]);
  if (!report) notFound();

  const userIds = Array.from(new Set([report.generated_by, ...audit.map((a) => a.changed_by)]));
  const userLookup: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .in('id', userIds);
    for (const u of users ?? []) {
      userLookup[u.id] = u.name ?? u.email ?? 'unknown';
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <NptabReportDetailClient
        report={report}
        tenders={tenders}
        audit={audit}
        userLookup={userLookup}
        canEdit={session.user.role === 'dg'}
      />
    </div>
  );
}
