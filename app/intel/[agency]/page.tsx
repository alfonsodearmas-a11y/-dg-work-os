import { notFound } from 'next/navigation';
import { AgencyIntelPage } from '@/components/intel/AgencyIntelPage';
import { INTEL_AGENCY_META, isIntelAgency, type IntelAgency } from '@/lib/agencies';

export default async function IntelAgencyPage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency } = await params;
  const lower = agency.toLowerCase();
  if (!isIntelAgency(lower) || !INTEL_AGENCY_META[lower as IntelAgency]) notFound();
  return <AgencyIntelPage slug={lower as IntelAgency} />;
}
