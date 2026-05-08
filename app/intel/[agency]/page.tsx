import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { canAccessAgency } from '@/lib/auth-helpers';
import { INTEL_AGENCY_META, isIntelAgency, type IntelAgency } from '@/lib/agencies';
import { getAgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { AgencyBento } from '@/components/intel/bento/AgencyBento';

export const dynamic = 'force-dynamic';

export default async function IntelAgencyPage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency } = await params;
  const lower = agency.toLowerCase();
  if (!isIntelAgency(lower) || !INTEL_AGENCY_META[lower as IntelAgency]) notFound();

  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) {
    // Auth failure (401). Treat as not-found at the page level — the
    // middleware should already have redirected unauthenticated users to
    // /login; this branch covers session-expired edge cases.
    notFound();
  }
  const { session } = result;

  // Agency-mismatch: surface as notFound to avoid leaking which agency
  // slugs are wired. Mirrors the convention used by other gated routes.
  if (!canAccessAgency(session.user.role, session.user.agency, lower.toUpperCase())) {
    notFound();
  }

  const data = await getAgencyIntelData(lower.toUpperCase());

  return <AgencyBento slug={lower as IntelAgency} data={data} />;
}
