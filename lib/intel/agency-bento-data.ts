// Agency bento card hrefs — derived per agency. Kept here (server-importable)
// rather than inside each card component so future href changes happen in one
// place. Row-1 destinations (/tasks, /projects/delayed, /procurement) now
// honor `?agency=<UPPERCASE>` so executives land on a pre-scoped list instead
// of the ministry-wide view. See fix/intel-viewall-agency-filter for the
// three-layer wiring (lib query, API route, client component) per surface.
//
// Data source notes for future contributors:
//
// - Pending Service Applications on the GPL bento card reads from
//   `customer_applications` via getOutstandingApplications() in
//   lib/intel/get-agency-intel-data.ts. This is the historic source.
//
// - The standalone /intel/pending-applications page reads from a different
//   table, `pending_applications`, via /api/pending-applications. Both GPL
//   and GWI surface there.
//
// These two sources are NOT synchronized. If you migrate to a single source,
// coordinate with the data-pipeline owner first; both surfaces depend on the
// current split.

import type { IntelAgency } from '@/lib/agencies';

export interface BentoHrefs {
  tasks: string;
  projects: string;
  procurement: string;
  tendersInEval: string;
  // GPL-only deep links. Undefined for non-GPL agencies.
  gridHealth?: string;
  pendingApplications?: string;
  applicationEfficiency?: string;
  stationAvailability?: string;
  outages?: string;
  methodology?: string;
  dbisUpload?: string;
  // HAS-only.
  airstrips?: string;
}

export function getBentoHrefs(slug: IntelAgency): BentoHrefs {
  // Canonical agency codes are UPPERCASE per migration 106. The intel route
  // slug is lowercase, so we upper-case for the deep-link to match how each
  // destination's data layer (tasks.agency, projects.sub_agency, tender.agency)
  // stores the value. Same convention used by pendingApplications below.
  const agency = slug.toUpperCase();
  const base: BentoHrefs = {
    tasks: `/tasks?agency=${agency}`,
    projects: `/projects/delayed?agency=${agency}`,
    procurement: `/procurement?agency=${agency}`,
    tendersInEval: `/procurement?agency=${agency}`,
  };
  if (slug === 'gpl') {
    base.gridHealth = '/pulse/gpl/grid-health';
    base.outages = '/pulse/gpl/grid-health';
    base.pendingApplications = '/intel/pending-applications?agency=GPL';
    base.applicationEfficiency = '/intel/pending-applications?agency=GPL';
    base.stationAvailability = '/intel/gpl/dbis';
    base.methodology = '/intel/gpl/methodology';
    base.dbisUpload = '/intel/gpl/dbis';
  }
  if (slug === 'has') {
    base.airstrips = '/airstrips';
  }
  return base;
}

// SAIDI / SAIFI display formatting — units must always render alongside the
// number, never the bare ratio. Source: customer-facing brief refinement.
export function formatSaidi(minutes: number | null): string {
  if (minutes == null) return '—';
  return `${minutes.toFixed(1)} min/customer`;
}

export function formatSaifi(ratio: number | null): string {
  if (ratio == null) return '—';
  return `${ratio.toFixed(2)} events/customer`;
}
