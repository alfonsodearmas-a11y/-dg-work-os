/* eslint-disable react/no-unknown-property */
// @react-pdf/renderer uses element names that React types don't recognize
// (Document, Page, Text, View, StyleSheet). Disable the rule file-wide.
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { AgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { formatDuration } from '@/lib/calendar-utils';

// ---------------------------------------------------------------------------
// Styling — matches the navy/gold tokens from app/globals.css.
// react-pdf only supports a subset of CSS; we encode hex literals directly.
// ---------------------------------------------------------------------------

const COLOR_NAVY_950 = '#0a1628';
const COLOR_NAVY_900 = '#1a2744';
const COLOR_NAVY_800 = '#2d3a52';
const COLOR_NAVY_600 = '#64748b';
const COLOR_GOLD_500 = '#d4af37';
const COLOR_WHITE = '#ffffff';
const COLOR_RED = '#dc2626';
const COLOR_AMBER = '#d97706';

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLOR_NAVY_950,
    color: COLOR_WHITE,
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 36,
    lineHeight: 1.4,
  },
  cover: {
    backgroundColor: COLOR_NAVY_950,
    color: COLOR_WHITE,
    padding: 48,
    height: '100%',
  },
  coverTitle: {
    color: COLOR_GOLD_500,
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 8,
  },
  coverSubtitle: {
    color: COLOR_NAVY_600,
    fontSize: 14,
    marginBottom: 32,
  },
  coverMeta: { color: COLOR_NAVY_600, fontSize: 11 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 700,
    color: COLOR_GOLD_500,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_NAVY_800,
    paddingBottom: 4,
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR_NAVY_800,
  },
  rowTitle: { color: COLOR_WHITE, fontSize: 10 },
  rowMeta: { color: COLOR_NAVY_600, fontSize: 9, marginTop: 2 },
  empty: { color: COLOR_NAVY_600, fontSize: 10, fontStyle: 'italic', paddingVertical: 8 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  metricCell: {
    width: '50%',
    padding: 4,
  },
  metricLabel: { color: COLOR_NAVY_600, fontSize: 9, textTransform: 'uppercase' },
  metricValue: { color: COLOR_WHITE, fontSize: 16, fontWeight: 700 },
  metricSub: { color: COLOR_NAVY_600, fontSize: 8, marginTop: 1 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: COLOR_NAVY_600,
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderTopColor: COLOR_NAVY_800,
    paddingTop: 8,
  },
});

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

function CoverPage({
  data,
  generatedBy,
}: {
  data: AgencyIntelData;
  generatedBy: string;
}) {
  const date = new Date(data.generated_at).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  return (
    <Page size="A4" style={styles.cover}>
      <View>
        <Text style={styles.coverTitle}>{data.agency} Intel Report</Text>
        <Text style={styles.coverSubtitle}>
          Ministry of Public Utilities &amp; Aviation · DG Work OS
        </Text>
        <Text style={styles.coverMeta}>Generated: {date}</Text>
        <Text style={styles.coverMeta}>By: {generatedBy}</Text>
        {data.agency_head.name ? (
          <Text style={[styles.coverMeta, { marginTop: 8 }]}>
            Agency head: {data.agency_head.name}
          </Text>
        ) : null}
      </View>
      <View style={{ marginTop: 'auto' }}>
        <Text style={styles.coverMeta}>
          Open tasks: {data.open_tasks.length} · Delayed projects:{' '}
          {data.delayed_projects.length} · Critical procurement:{' '}
          {data.critical_procurement.length}
        </Text>
      </View>
    </Page>
  );
}

function OpenTasksSection({ data }: { data: AgencyIntelData }) {
  if (data.open_tasks.length === 0) {
    return <Text style={styles.empty}>No open items</Text>;
  }
  const sorted = [...data.open_tasks]
    .sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    })
    .slice(0, 30);
  return (
    <View>
      {sorted.map((t) => (
        <View key={t.id} style={styles.row}>
          <Text style={styles.rowTitle}>{t.title}</Text>
          <Text style={styles.rowMeta}>
            {t.status.toUpperCase()}
            {t.owner_name ? ` · ${t.owner_name}` : ''}
            {t.priority ? ` · ${t.priority}` : ''}
            {t.due_date
              ? ` · due ${t.due_date}${t.is_overdue ? ' (overdue)' : ''}`
              : ' · no due date'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DelayedProjectsSection({ data }: { data: AgencyIntelData }) {
  if (data.delayed_projects.length === 0) {
    return <Text style={styles.empty}>No open items</Text>;
  }
  const sorted = [...data.delayed_projects]
    .sort((a, b) => (b.days_overdue ?? -1) - (a.days_overdue ?? -1))
    .slice(0, 25);
  return (
    <View>
      {sorted.map((p) => (
        <View key={p.id} style={styles.row}>
          <Text style={styles.rowTitle}>{p.project_name}</Text>
          <Text style={styles.rowMeta}>
            {typeof p.completion_percent === 'number'
              ? `${Math.round(Number(p.completion_percent))}% complete`
              : '— complete'}
            {p.days_overdue != null && p.days_overdue > 0
              ? ` · ${p.days_overdue}d overdue`
              : ''}
            {p.contractors ? ` · ${p.contractors}` : ''}
            {p.contract_value
              ? ` · GYD ${Number(p.contract_value).toLocaleString()}`
              : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function CriticalProcurementSection({ data }: { data: AgencyIntelData }) {
  if (data.critical_procurement.length === 0) {
    return <Text style={styles.empty}>No open items</Text>;
  }
  const reasonLabel = (r: string) => {
    if (r === 'missing_pending_decision') return 'Missing — pending decision';
    if (r === 'missing_from_upload') return 'Missing from upload';
    if (r === 'stale_award') return 'Stale award';
    return r;
  };
  return (
    <View>
      {data.critical_procurement.slice(0, 25).map((t) => (
        <View key={t.id} style={styles.row}>
          <Text style={styles.rowTitle}>{t.description}</Text>
          <Text style={styles.rowMeta}>
            {t.stage.toUpperCase()} · {reasonLabel(t.reason)}
            {t.days_in_stage != null ? ` · ${t.days_in_stage}d in stage` : ''}
            {t.next_action_owner ? ` · next: ${t.next_action_owner}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function EvaluationTendersSection({ data }: { data: AgencyIntelData }) {
  if (data.evaluation_tenders.length === 0) {
    return <Text style={styles.empty}>No tenders in evaluation</Text>;
  }
  return (
    <View>
      {data.evaluation_tenders.slice(0, 25).map((t) => (
        <View key={t.id} style={styles.row}>
          <Text style={styles.rowTitle}>{t.description}</Text>
          <Text style={styles.rowMeta}>
            EVALUATION
            {t.days_in_stage != null ? ` · ${t.days_in_stage}d in stage` : ''}
            {t.sub_programme_name
              ? ` · ${t.sub_programme_name}`
              : t.sub_programme_code
                ? ` · ${t.sub_programme_code}`
                : ''}
            {t.next_action_owner ? ` · next: ${t.next_action_owner}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function HasExtrasSection({ data }: { data: AgencyIntelData }) {
  if (!data.has) return null;
  const o = data.has.airstrip_ops;
  return (
    <View>
      <Text style={styles.sectionHeader}>HAS · Airstrip Operations</Text>
      <View style={styles.metricGrid}>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Operational</Text>
          <Text style={styles.metricValue}>{o.operational}</Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Limited / rehab</Text>
          <Text style={styles.metricValue}>{o.limited_or_rehab}</Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Overdue inspection</Text>
          <Text
            style={[
              styles.metricValue,
              { color: o.overdue_inspection > 0 ? COLOR_RED : COLOR_NAVY_600 },
            ]}
          >
            {o.overdue_inspection} / {o.total}
          </Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Pending verification</Text>
          <Text style={styles.metricValue}>{o.pending_verification}</Text>
        </View>
      </View>

      {o.overdue_inspection > 0 ? (
        <View>
          <Text style={styles.sectionHeader}>HAS · Overdue Inspections</Text>
          {o.overdue.slice(0, 25).map((a) => (
            <View key={a.id} style={styles.row}>
              <Text style={styles.rowTitle}>{a.name}</Text>
              <Text style={styles.rowMeta}>
                Region {a.region}
                {' · '}
                {a.last_inspection_date == null
                  ? 'Never inspected'
                  : `Last inspected ${a.last_inspection_date}`}
                {a.days_since_inspection != null ? ` · ${a.days_since_inspection}d ago` : ''}
                {a.surface_condition ? ` · ${a.surface_condition}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function GPLExtrasSection({ data }: { data: AgencyIntelData }) {
  if (!data.gpl) return null;
  const { outstanding_applications, station_health, recent_outages, outage_count_mtd } = data.gpl;

  return (
    <View>
      <Text style={styles.sectionHeader}>GPL · Outstanding Applications</Text>
      <View style={styles.metricGrid}>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Total</Text>
          <Text style={styles.metricValue}>{outstanding_applications.total}</Text>
          {outstanding_applications.oldest_days != null ? (
            <Text style={styles.metricSub}>
              Oldest: {outstanding_applications.oldest_days} days
            </Text>
          ) : null}
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Aging</Text>
          <Text style={styles.metricSub}>
            0–30: {outstanding_applications.by_age_bucket['0_30']} ·{' '}
            31–60: {outstanding_applications.by_age_bucket['31_60']}
          </Text>
          <Text
            style={[
              styles.metricSub,
              {
                color:
                  outstanding_applications.by_age_bucket['90_plus'] > 0
                    ? COLOR_RED
                    : COLOR_NAVY_600,
              },
            ]}
          >
            61–90: {outstanding_applications.by_age_bucket['61_90']} · 90+:{' '}
            {outstanding_applications.by_age_bucket['90_plus']}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>GPL · Station Health</Text>
      {station_health.length === 0 ? (
        <Text style={styles.empty}>No station data</Text>
      ) : (
        station_health.map((st) => {
          const color =
            st.status === 'critical'
              ? COLOR_RED
              : st.status === 'degraded'
                ? COLOR_AMBER
                : COLOR_WHITE;
          return (
            <View key={st.station} style={styles.row}>
              <Text style={[styles.rowTitle, { color }]}>{st.station}</Text>
              <Text style={styles.rowMeta}>
                {st.total_available_mw != null ? st.total_available_mw.toFixed(1) : '—'}/
                {st.total_derated_capacity_mw != null
                  ? st.total_derated_capacity_mw.toFixed(1)
                  : '—'}{' '}
                MW
                {st.pct_of_derated != null
                  ? ` · ${Math.round(st.pct_of_derated)}% of derated`
                  : ''}
                {' · '}
                {st.status}
              </Text>
            </View>
          );
        })
      )}

      <Text style={styles.sectionHeader}>GPL · Outages (MTD)</Text>
      <Text style={styles.metricSub}>
        {outage_count_mtd} outage{outage_count_mtd === 1 ? '' : 's'} this month
        {recent_outages.length < outage_count_mtd
          ? ` · showing ${recent_outages.length} most recent`
          : ''}
      </Text>
      {recent_outages.length === 0 ? (
        <Text style={styles.empty}>No outages this month</Text>
      ) : (
        recent_outages.map((o) => (
          <View key={o.id} style={styles.row}>
            <Text style={styles.rowTitle}>
              {o.feeder_code || o.substation_code || 'Outage'}
              {o.areas_affected ? ` — ${o.areas_affected}` : ''}
            </Text>
            <Text style={styles.rowMeta}>
              {o.date ?? ''}
              {o.time_out ? ` ${o.time_out.slice(0, 5)}` : ''}
              {o.duration_minutes != null ? ` · ${formatDuration(o.duration_minutes)}` : ''}
              {o.customers_affected != null
                ? ` · ${o.customers_affected.toLocaleString()} customers`
                : ''}
              {o.status ? ` · ${o.status}` : ''}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Top-level Document
// ---------------------------------------------------------------------------

function ReportDocument({
  data,
  generatedBy,
}: {
  data: AgencyIntelData;
  generatedBy: string;
}) {
  const footer = `${data.agency} · Generated by ${generatedBy} · ${new Date(
    data.generated_at,
  ).toISOString()}`;
  return (
    <Document>
      <CoverPage data={data} generatedBy={generatedBy} />
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.sectionHeader}>Open Tasks ({data.open_tasks.length})</Text>
        <OpenTasksSection data={data} />

        <Text style={styles.sectionHeader}>
          Delayed Projects ({data.delayed_projects.length})
        </Text>
        <DelayedProjectsSection data={data} />

        <Text style={styles.sectionHeader}>
          Critical Procurement ({data.critical_procurement.length})
        </Text>
        <CriticalProcurementSection data={data} />

        <Text style={styles.sectionHeader}>
          Tenders in Evaluation ({data.evaluation_tenders.length})
        </Text>
        <EvaluationTendersSection data={data} />

        {data.gpl ? <GPLExtrasSection data={data} /> : null}
        {data.has ? <HasExtrasSection data={data} /> : null}

        <Text style={styles.footer} fixed>
          {footer}
        </Text>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Public API — server-only
// ---------------------------------------------------------------------------

export async function renderAgencyIntelReportPDF(params: {
  data: AgencyIntelData;
  generatedBy: string;
}): Promise<Buffer> {
  const { data, generatedBy } = params;
  const stream = await pdf(<ReportDocument data={data} generatedBy={generatedBy} />)
    .toBuffer();
  // pdf().toBuffer() in @react-pdf/renderer returns a Node Readable that
  // resolves to a Buffer; await on the stream yields the Buffer.
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | Uint8Array) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
