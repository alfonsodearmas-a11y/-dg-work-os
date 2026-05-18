import type { IntelAgency } from '@/lib/agencies';
import { agencyAccent } from '@/lib/agencies';
import type { AgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { getBentoHrefs } from '@/lib/intel/agency-bento-data';
import { AgencyHero } from './AgencyHero';
import { TasksCard } from './cards/TasksCard';
import { ProjectsCard } from './cards/ProjectsCard';
import { ProcurementCard } from './cards/ProcurementCard';
import { GridReliabilityCard } from './cards/GridReliabilityCard';
import { OutagesCard } from './cards/OutagesCard';
import { ApplicationEfficiencyCard } from './cards/ApplicationEfficiencyCard';
import { StationAvailabilityCard } from './cards/StationAvailabilityCard';
import { AirstripOperationsCard } from './cards/AirstripOperationsCard';

interface AgencyBentoProps {
  slug: IntelAgency;
  data: AgencyIntelData;
}

// Bento grid layout. xl breakpoint defines explicit cell spans for the
// 12-col grid. Below xl, cells flow in document order in a 2- or 1-col stack.
//
// xl layout (12 cols × 4 rows):
//   Row 1:  Tasks (4) | Projects (4) | Procurement (4)
//   Row 2:  GridReliability (8, 2 rows) | Outages (4, 2 rows)
//   Row 3:  (GR cont)                   | (Outages cont)
//   Row 4:  AppEfficiency (6) | StationAvailability (6)
//
// HAS variant replaces the entire GPL row-2/3 with the AirstripOps card and
// uses only the three common cells in row 1.
export function AgencyBento({ slug, data }: AgencyBentoProps) {
  const hrefs = getBentoHrefs(slug);
  const accent = agencyAccent(slug);
  const isGPL = !!data.gpl;
  const isHAS = !!data.has;

  // Soft ambient glow keyed to the agency accent — mirrors the page-level
  // radial gradient in the design. Positioned absolutely so it sits behind the
  // grid without affecting layout.
  const glow = (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute -top-[6%] -left-[4%] h-[480px] w-[700px] rounded-full blur-3xl opacity-[0.10]"
        style={{ background: accent }}
      />
      <div
        className="absolute bottom-[-10%] right-[-10%] h-[600px] w-[900px] rounded-full blur-3xl opacity-[0.05]"
        style={{ background: '#5BD6A5' }}
      />
    </div>
  );

  return (
    <div className="relative space-y-6">
      {glow}
      <AgencyHero slug={slug} data={data} />

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 xl:gap-5 auto-rows-min">
        {/* Row 1 — three common cards (4 cols each on xl, 1 col each on md, full on mobile) */}
        <TasksCard
          items={data.open_tasks}
          href={hrefs.tasks}
          accent={accent}
          className="xl:col-span-4"
        />
        <ProjectsCard
          items={data.delayed_projects}
          href={hrefs.projects}
          accent={accent}
          className="xl:col-span-4"
        />
        <ProcurementCard
          critical={data.critical_procurement}
          evaluation={data.evaluation_tenders}
          href={hrefs.procurement}
          accent={accent}
          className="md:col-span-2 xl:col-span-4"
        />

        {/* GPL: hero pair (Grid Reliability 8x2 + Outages 4x2), then row 4 */}
        {isGPL && data.gpl ? (
          <>
            <GridReliabilityCard
              data={data.gpl.grid_reliability}
              aggregates={data.gpl.outage_aggregates}
              methodologyHref={hrefs.methodology}
              className="xl:col-span-8 xl:row-span-2"
              accent={accent}
            />
            <OutagesCard
              items={data.gpl.recent_outages}
              mtd={data.gpl.outage_count_mtd}
              href={hrefs.outages ?? '/pulse/gpl/grid-health'}
              className="xl:col-span-4 xl:row-span-2"
            />
            <ApplicationEfficiencyCard
              throughput={data.gpl.application_throughput}
              pipeline={data.gpl.application_pipeline}
              href={hrefs.applicationEfficiency ?? '/intel/pending-applications'}
              methodologyHref={hrefs.methodology}
              accent={accent}
              className="xl:col-span-6"
            />
            <StationAvailabilityCard
              stations={data.gpl.station_health}
              href={hrefs.stationAvailability ?? '/intel/gpl/dbis'}
              methodologyHref={hrefs.methodology}
              className="xl:col-span-6"
            />
          </>
        ) : null}

        {/* HAS: airstrip operations spans the rest of the grid below row 1 */}
        {isHAS && data.has ? (
          <AirstripOperationsCard
            data={data.has.airstrip_ops}
            href={hrefs.airstrips ?? '/airstrips'}
            accent={accent}
            className="xl:col-span-12"
          />
        ) : null}
      </section>
    </div>
  );
}
