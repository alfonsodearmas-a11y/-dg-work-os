import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { isIntelAgency, INTEL_AGENCY_META, type IntelAgency } from '@/lib/agencies';
import { prepareReport } from '@/lib/intel/prepare-report';
import { DownloadButton } from './DownloadButton';
import { ScheduleList } from './ScheduleList';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ReportPage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency } = await params;
  const lower = agency.toLowerCase();
  if (!isIntelAgency(lower) || !INTEL_AGENCY_META[lower as IntelAgency]) {
    notFound();
  }

  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) notFound();
  const { session } = result;
  if (!canAccessAgency(session.user.role, session.user.agency, lower)) {
    notFound();
  }

  const prepared = await prepareReport({
    agency: lower,
    coverMessage: null,
    senderName: session.user.name || session.user.email,
    senderEmail: session.user.email ?? null,
  });

  return (
    <div className="min-h-screen bg-[var(--navy-950)] py-10">
      <div className="max-w-5xl mx-auto px-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {prepared.agencyDisplayName} Intel Report
          </h1>
          <p className="text-sm text-[var(--navy-600)] mt-1">
            View the report, download a PDF, or schedule recurring email sends.
          </p>
        </div>
        <DownloadButton agency={lower} />
      </div>
      {prepared.htmlElement}
      <div className="max-w-5xl mx-auto px-4 mt-10">
        <ScheduleList agency={lower} agencyDisplay={INTEL_AGENCY_META[lower as IntelAgency]?.display ?? lower.toUpperCase()} />
      </div>
    </div>
  );
}
