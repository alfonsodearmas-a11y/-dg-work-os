// HTML/React view of the Agency Intel Report. Renders the same content as
// lib/pdf/intel-report-render.tsx, consuming the same plain tokens. The
// design lives once; the PDF mirrors this view.
//
// Item lists uncapped by design, matching the PDF.

import * as React from 'react';

import type { AgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { COLORS, PAGE, SPACE, TYPE } from '@/lib/pdf/intel-report-tokens';
import {
  computeLedeStats,
  formatDueDate,
  formatGYD,
  isPresentOwner,
  reasonLabel,
  stageLabel,
  type LedeStats,
} from '@/lib/intel/render-utils';

type Props = {
  agencyDisplayName: string;
  recipientName: string;
  generatedAt: Date;
  data: AgencyIntelData;
};

const MIDDLE_DOT = '·';

function px(n: number) {
  return `${n}px`;
}

const s = {
  paper: {
    backgroundColor: COLORS.paper,
    color: COLORS.body,
    fontFamily: '"Inter", system-ui, sans-serif',
    padding: `${px(PAGE.marginTop)} ${px(PAGE.marginX)}`,
    maxWidth: 880,
    margin: '0 auto',
    boxShadow: '0 1px 2px rgba(15,23,42,0.08), 0 8px 24px rgba(15,23,42,0.10)',
    borderRadius: 4,
  },
  title: {
    fontSize: px(TYPE.title.size),
    fontWeight: TYPE.title.weight,
    lineHeight: TYPE.title.lineHeight,
    letterSpacing: px(TYPE.title.letterSpacing),
    color: COLORS.ink,
    margin: 0,
  },
  subtitle: {
    fontSize: px(TYPE.subtitle.size),
    fontWeight: TYPE.subtitle.weight,
    color: COLORS.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: px(TYPE.subtitle.letterSpacing),
    marginTop: 4,
  },
  generated: {
    fontSize: px(TYPE.meta.size),
    color: COLORS.muted,
    marginTop: 6,
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    borderTop: `${SPACE.ruleThickness}px solid ${COLORS.rule}`,
    borderBottom: `${SPACE.ruleThickness}px solid ${COLORS.rule}`,
    padding: '12px 0',
    margin: `${px(SPACE.headerToStats)} 0 ${px(SPACE.statsToFirstSection)} 0`,
  },
  statNumber: {
    fontSize: px(TYPE.statNumber.size),
    fontWeight: TYPE.statNumber.weight,
    color: COLORS.ink,
    lineHeight: TYPE.statNumber.lineHeight,
  },
  statLabel: {
    fontSize: px(TYPE.statLabel.size),
    color: COLORS.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: px(TYPE.statLabel.letterSpacing),
    marginTop: 4,
  },
  section: { marginBottom: px(SPACE.sectionGap) },
  sectionLabel: {
    fontSize: px(TYPE.sectionLabel.size),
    fontWeight: TYPE.sectionLabel.weight,
    color: COLORS.ink,
    textTransform: 'uppercase' as const,
    letterSpacing: px(TYPE.sectionLabel.letterSpacing),
    marginBottom: 8,
  },
  sectionLede: {
    fontSize: px(TYPE.body.size),
    color: COLORS.mutedDeep,
    marginBottom: 10,
  },
  item: {
    borderTop: `${SPACE.ruleThickness}px solid ${COLORS.rule}`,
    padding: '10px 0',
  },
  itemTitle: {
    fontSize: px(TYPE.itemTitle.size),
    fontWeight: TYPE.itemTitle.weight,
    color: COLORS.ink,
  },
  itemMeta: { fontSize: px(TYPE.meta.size), color: COLORS.muted, marginTop: 4 },
  itemMetaOverdue: {
    fontSize: px(TYPE.meta.size),
    color: COLORS.overdue,
    marginTop: 4,
  },
  itemStatRow: { display: 'flex', gap: 20, marginTop: 6 },
  itemStatNumber: {
    fontSize: px(TYPE.cellNumber.size),
    fontWeight: TYPE.cellNumber.weight,
    color: COLORS.accent,
  },
  itemStatLabel: {
    fontSize: px(TYPE.cellLabel.size),
    color: COLORS.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: px(TYPE.cellLabel.letterSpacing),
    marginTop: 2,
  },
};

export function IntelReportView({
  agencyDisplayName,
  recipientName,
  generatedAt,
  data,
}: Props) {
  const stats = computeLedeStats(data);
  const generated = generatedAt.toLocaleDateString('en-GY', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return (
    <article style={s.paper}>
      <header>
        <h1 style={s.title}>{agencyDisplayName} Intel Report</h1>
        <div style={s.subtitle}>Ministry of Public Utilities and Aviation</div>
        <div style={s.generated}>
          Prepared {generated} for {recipientName}
        </div>
      </header>
      <div style={s.stats}>
        <div>
          <div style={s.statNumber}>{stats.openTasksTotal}</div>
          <div style={s.statLabel}>Open tasks</div>
        </div>
        <div>
          <div style={s.statNumber}>{stats.delayedProjectsTotal}</div>
          <div style={s.statLabel}>Delayed projects</div>
        </div>
        <div>
          <div style={s.statNumber}>{stats.procurementTotal}</div>
          <div style={s.statLabel}>Procurement attention</div>
        </div>
      </div>
      <OpenTasks data={data} stats={stats} />
      <DelayedProjects data={data} stats={stats} />
      <Procurement data={data} stats={stats} />
    </article>
  );
}

function OpenTasks({ data, stats }: { data: AgencyIntelData; stats: LedeStats }) {
  const tasks = data.open_tasks ?? [];
  if (tasks.length === 0) return null;
  const lede =
    stats.openTasksOverdue > 0
      ? `${stats.openTasksTotal} open. ${stats.openTasksOverdue} overdue.`
      : `${stats.openTasksTotal} open.`;
  return (
    <section style={s.section}>
      <h2 style={s.sectionLabel}>Open Tasks</h2>
      <div style={s.sectionLede}>{lede}</div>
      {tasks.map((t) => {
        const due = formatDueDate(t.due_date);
        const parts: string[] = [(t.status ?? 'open').toUpperCase()];
        if (due) parts.push(`Due ${due}`);
        if (isPresentOwner(t.owner_name)) parts.push(t.owner_name as string);
        return (
          <div key={t.id} style={s.item}>
            <div style={s.itemTitle}>{t.title ?? ''}</div>
            <div style={t.is_overdue ? s.itemMetaOverdue : s.itemMeta}>
              {parts.join(`  ${MIDDLE_DOT}  `)}
              {t.is_overdue ? `  ${MIDDLE_DOT}  Overdue` : ''}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DelayedProjects({
  data,
  stats,
}: {
  data: AgencyIntelData;
  stats: LedeStats;
}) {
  const projects = data.delayed_projects ?? [];
  if (projects.length === 0) return null;
  const lede =
    stats.delayedTotalDaysSlip > 0
      ? `${stats.delayedProjectsTotal} projects late. ${stats.delayedTotalDaysSlip} total days of slip.`
      : `${stats.delayedProjectsTotal} projects late.`;
  return (
    <section style={s.section}>
      <h2 style={s.sectionLabel}>Delayed Projects</h2>
      <div style={s.sectionLede}>{lede}</div>
      {projects.map((p) => {
        const value = formatGYD(p.contract_value);
        const cells: { num: string; label: string }[] = [];
        if (typeof p.completion_percent === 'number') {
          cells.push({
            num: `${Math.round(p.completion_percent)}%`,
            label: 'Complete',
          });
        }
        if (typeof p.days_overdue === 'number' && p.days_overdue > 0) {
          cells.push({ num: String(p.days_overdue), label: 'Days overdue' });
        }
        if (value) cells.push({ num: value, label: 'Value' });
        return (
          <div key={p.id} style={s.item}>
            <div style={s.itemTitle}>{p.project_name ?? ''}</div>
            {isPresentOwner(p.contractors) && (
              <div style={s.itemMeta}>{p.contractors}</div>
            )}
            {cells.length > 0 && (
              <div style={s.itemStatRow}>
                {cells.map((c, j) => (
                  <div key={`c-${j}`}>
                    <div style={s.itemStatNumber}>{c.num}</div>
                    <div style={s.itemStatLabel}>{c.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Procurement({
  data,
  stats,
}: {
  data: AgencyIntelData;
  stats: LedeStats;
}) {
  const tenders = data.critical_procurement ?? [];
  if (tenders.length === 0) return null;
  const lede =
    stats.procurementUnnamed > 0
      ? `${stats.procurementTotal} procurements. ${stats.procurementUnnamed} have no named next-action owner.`
      : `${stats.procurementTotal} procurements.`;
  return (
    <section style={s.section}>
      <h2 style={s.sectionLabel}>Procurement Attention</h2>
      <div style={s.sectionLede}>{lede}</div>
      {tenders.map((t) => {
        const stage = stageLabel(t.stage);
        const reason = reasonLabel(t.reason);
        const parts: string[] = [];
        if (stage) parts.push(stage);
        if (typeof t.days_in_stage === 'number') parts.push(`${t.days_in_stage} days in stage`);
        if (isPresentOwner(t.next_action_owner)) parts.push(`Next: ${t.next_action_owner}`);
        return (
          <div key={t.id} style={s.item}>
            <div style={s.itemTitle}>{t.description ?? ''}</div>
            {parts.length > 0 && (
              <div style={s.itemMeta}>{parts.join(`  ${MIDDLE_DOT}  `)}</div>
            )}
            {reason && <div style={s.itemMeta}>{reason}</div>}
          </div>
        );
      })}
    </section>
  );
}
