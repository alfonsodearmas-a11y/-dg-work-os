// Plain Agency Intel Report renderer. Default template. The editorial
// magazine treatment (lib/pdf/intel-brief-render.tsx) is reachable via
// `?template=editorial` for one release.
//
// Field-vs-record discipline: a missing field disappears (no placeholder
// string, no em-dash, no badge); a record only disappears when the record
// itself is absent. See lib/intel/render-utils.ts for the lede math.
//
// Item lists are uncapped by design. The brief is operational, not
// editorial: every open task, every delayed project, every critical tender
// must appear. A long week produces a long PDF. Do not reintroduce caps.

import path from 'node:path';
import * as React from 'react';
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';

import type { AgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { COLORS, FONT_FAMILY, PAGE, SPACE, TYPE } from './intel-report-tokens';
import {
  computeLedeStats,
  formatDueDate,
  formatGYD,
  isPresentOwner,
  reasonLabel,
  stageLabel,
  type LedeStats,
} from '@/lib/intel/render-utils';

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');

Font.register({
  family: FONT_FAMILY,
  fonts: [
    { src: path.join(FONT_DIR, 'Inter-Light.ttf'),   fontWeight: 300 },
    { src: path.join(FONT_DIR, 'Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'Inter-Bold.ttf'),    fontWeight: 700 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

const MIDDLE_DOT = '·';

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.paper,
    color: COLORS.body,
    fontFamily: FONT_FAMILY,
    paddingTop: PAGE.marginTop,
    paddingBottom: PAGE.marginBottom,
    paddingHorizontal: PAGE.marginX,
  },
  header: { marginBottom: SPACE.headerToStats },
  title: {
    fontSize: TYPE.title.size,
    fontWeight: TYPE.title.weight,
    lineHeight: TYPE.title.lineHeight,
    letterSpacing: TYPE.title.letterSpacing,
    color: COLORS.ink,
  },
  subtitle: {
    fontSize: TYPE.subtitle.size,
    fontWeight: TYPE.subtitle.weight,
    lineHeight: TYPE.subtitle.lineHeight,
    letterSpacing: TYPE.subtitle.letterSpacing,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  generatedLine: {
    fontSize: TYPE.meta.size,
    color: COLORS.muted,
    marginTop: 6,
  },
  statsStrip: {
    flexDirection: 'row',
    borderTopWidth: SPACE.ruleThickness,
    borderBottomWidth: SPACE.ruleThickness,
    borderColor: COLORS.rule,
    paddingVertical: 12,
    marginBottom: SPACE.statsToFirstSection,
  },
  statBlock: { flex: 1 },
  statNumber: {
    fontSize: TYPE.statNumber.size,
    fontWeight: TYPE.statNumber.weight,
    lineHeight: TYPE.statNumber.lineHeight,
    color: COLORS.ink,
  },
  statLabel: {
    fontSize: TYPE.statLabel.size,
    fontWeight: TYPE.statLabel.weight,
    lineHeight: TYPE.statLabel.lineHeight,
    letterSpacing: TYPE.statLabel.letterSpacing,
    textTransform: 'uppercase',
    color: COLORS.muted,
    marginTop: 4,
  },
  section: { marginBottom: SPACE.sectionGap },
  sectionLabel: {
    fontSize: TYPE.sectionLabel.size,
    fontWeight: TYPE.sectionLabel.weight,
    lineHeight: TYPE.sectionLabel.lineHeight,
    letterSpacing: TYPE.sectionLabel.letterSpacing,
    textTransform: 'uppercase',
    color: COLORS.ink,
    marginBottom: SPACE.sectionHeaderToFirstItem,
  },
  sectionLede: {
    fontSize: TYPE.body.size,
    lineHeight: TYPE.body.lineHeight,
    color: COLORS.mutedDeep,
    marginBottom: 10,
  },
  item: {
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: SPACE.ruleThickness,
    borderColor: COLORS.rule,
  },
  itemTitle: {
    fontSize: TYPE.itemTitle.size,
    fontWeight: TYPE.itemTitle.weight,
    lineHeight: TYPE.itemTitle.lineHeight,
    color: COLORS.ink,
  },
  itemMeta: {
    fontSize: TYPE.meta.size,
    lineHeight: TYPE.meta.lineHeight,
    color: COLORS.muted,
    marginTop: SPACE.itemInnerGap,
  },
  itemMetaOverdue: {
    fontSize: TYPE.meta.size,
    lineHeight: TYPE.meta.lineHeight,
    color: COLORS.overdue,
    marginTop: SPACE.itemInnerGap,
  },
  itemStatRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  itemStatCell: { marginRight: 18 },
  itemStatNumber: {
    fontSize: TYPE.cellNumber.size,
    fontWeight: TYPE.cellNumber.weight,
    color: COLORS.accent,
  },
  itemStatLabel: {
    fontSize: TYPE.cellLabel.size,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: TYPE.cellLabel.letterSpacing,
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: PAGE.marginX,
    right: PAGE.marginX,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: TYPE.footer.size,
    color: COLORS.muted,
  },
});

export type IntelReportProps = {
  agencyDisplayName: string;
  recipientName: string;
  generatedAt: Date;
  data: AgencyIntelData;
};

function Header({ agencyDisplayName, generatedAt }: { agencyDisplayName: string; generatedAt: Date }) {
  const generated = generatedAt.toLocaleDateString('en-GY', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{agencyDisplayName} Intel Report</Text>
      <Text style={styles.subtitle}>Ministry of Public Utilities and Aviation</Text>
      <Text style={styles.generatedLine}>Prepared {generated}</Text>
    </View>
  );
}

function StatsStrip({ stats }: { stats: LedeStats }) {
  return (
    <View style={styles.statsStrip}>
      <View style={styles.statBlock}>
        <Text style={styles.statNumber}>{stats.openTasksTotal}</Text>
        <Text style={styles.statLabel}>Open tasks</Text>
      </View>
      <View style={styles.statBlock}>
        <Text style={styles.statNumber}>{stats.delayedProjectsTotal}</Text>
        <Text style={styles.statLabel}>Delayed projects</Text>
      </View>
      <View style={styles.statBlock}>
        <Text style={styles.statNumber}>{stats.procurementTotal}</Text>
        <Text style={styles.statLabel}>Procurement attention</Text>
      </View>
    </View>
  );
}

function OpenTasksSection({ data, stats }: { data: AgencyIntelData; stats: LedeStats }) {
  const tasks = data.open_tasks ?? [];
  if (tasks.length === 0) return null;
  const lede =
    stats.openTasksOverdue > 0
      ? `${stats.openTasksTotal} open. ${stats.openTasksOverdue} overdue.`
      : `${stats.openTasksTotal} open.`;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Open Tasks</Text>
      <Text style={styles.sectionLede}>{lede}</Text>
      {tasks.map((t) => {
        const due = formatDueDate(t.due_date);
        const parts: string[] = [(t.status ?? 'open').toUpperCase()];
        if (due) parts.push(`Due ${due}`);
        if (isPresentOwner(t.owner_name)) parts.push(t.owner_name as string);
        const metaStyle = t.is_overdue ? styles.itemMetaOverdue : styles.itemMeta;
        return (
          <View key={t.id} style={styles.item} wrap={false}>
            <Text style={styles.itemTitle}>{t.title ?? ''}</Text>
            <Text style={metaStyle}>
              {parts.join(`  ${MIDDLE_DOT}  `)}
              {t.is_overdue ? `  ${MIDDLE_DOT}  Overdue` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function DelayedProjectsSection({ data, stats }: { data: AgencyIntelData; stats: LedeStats }) {
  const projects = data.delayed_projects ?? [];
  if (projects.length === 0) return null;
  const lede =
    stats.delayedTotalDaysSlip > 0
      ? `${stats.delayedProjectsTotal} projects late. ${stats.delayedTotalDaysSlip} total days of slip.`
      : `${stats.delayedProjectsTotal} projects late.`;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Delayed Projects</Text>
      <Text style={styles.sectionLede}>{lede}</Text>
      {projects.map((p) => {
        const value = formatGYD(p.contract_value);
        const cells: { num: string; label: string }[] = [];
        if (typeof p.completion_percent === 'number') {
          cells.push({ num: `${Math.round(p.completion_percent)}%`, label: 'Complete' });
        }
        if (typeof p.days_overdue === 'number' && p.days_overdue > 0) {
          cells.push({ num: String(p.days_overdue), label: 'Days overdue' });
        }
        if (value) {
          cells.push({ num: value, label: 'Value' });
        }
        return (
          <View key={p.id} style={styles.item} wrap={false}>
            <Text style={styles.itemTitle}>{p.project_name ?? ''}</Text>
            {isPresentOwner(p.contractors) && (
              <Text style={styles.itemMeta}>{p.contractors}</Text>
            )}
            {cells.length > 0 && (
              <View style={styles.itemStatRow}>
                {cells.map((c, j) => (
                  <View key={`c-${j}`} style={styles.itemStatCell}>
                    <Text style={styles.itemStatNumber}>{c.num}</Text>
                    <Text style={styles.itemStatLabel}>{c.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ProcurementSection({ data, stats }: { data: AgencyIntelData; stats: LedeStats }) {
  const tenders = data.critical_procurement ?? [];
  if (tenders.length === 0) return null;
  const lede =
    stats.procurementUnnamed > 0
      ? `${stats.procurementTotal} procurements. ${stats.procurementUnnamed} have no named next-action owner.`
      : `${stats.procurementTotal} procurements.`;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Procurement Attention</Text>
      <Text style={styles.sectionLede}>{lede}</Text>
      {tenders.map((t) => {
        const stage = stageLabel(t.stage);
        const reason = reasonLabel(t.reason);
        const parts: string[] = [];
        if (stage) parts.push(stage);
        if (typeof t.days_in_stage === 'number') parts.push(`${t.days_in_stage} days in stage`);
        if (isPresentOwner(t.next_action_owner)) parts.push(`Next: ${t.next_action_owner}`);
        return (
          <View key={t.id} style={styles.item} wrap={false}>
            <Text style={styles.itemTitle}>{t.description ?? ''}</Text>
            {parts.length > 0 && (
              <Text style={styles.itemMeta}>{parts.join(`  ${MIDDLE_DOT}  `)}</Text>
            )}
            {reason && <Text style={styles.itemMeta}>{reason}</Text>}
          </View>
        );
      })}
    </View>
  );
}

function Footer({ agencyDisplayName, generatedAt }: { agencyDisplayName: string; generatedAt: Date }) {
  const generated = generatedAt.toLocaleDateString('en-GY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return (
    <View style={styles.footer} fixed>
      <Text>
        {agencyDisplayName} Intel Report  {MIDDLE_DOT}  {generated}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function IntelReportDocument({
  agencyDisplayName,
  recipientName,
  generatedAt,
  data,
}: IntelReportProps) {
  const stats = computeLedeStats(data);
  return (
    <Document
      title={`${agencyDisplayName} Intel Report`}
      author="Ministry of Public Utilities and Aviation"
      subject={`Intel report for ${recipientName}`}
    >
      <Page size="A4" style={styles.page}>
        <Header agencyDisplayName={agencyDisplayName} generatedAt={generatedAt} />
        <StatsStrip stats={stats} />
        <OpenTasksSection data={data} stats={stats} />
        <DelayedProjectsSection data={data} stats={stats} />
        <ProcurementSection data={data} stats={stats} />
        <Footer agencyDisplayName={agencyDisplayName} generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}

export async function renderIntelReportPDF(props: IntelReportProps): Promise<Buffer> {
  const instance = pdf(<IntelReportDocument {...props} />);
  const stream = await instance.toBuffer();
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
