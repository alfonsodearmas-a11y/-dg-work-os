# Agency Intel Report Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the editorial Intel Brief with a plain ministry report (PDF + on-screen HTML), apply field-vs-record missing-data discipline, add direct view and PDF-download routes, and add recurring scheduled email sends.

**Architecture:** A single `prepareReport()` core in `lib/intel/prepare-report.ts` produces report data, a plain PDF buffer (`@react-pdf/renderer`), and a React HTML element. Both renderers consume one shared plain token module. Four consumers route through the core: the existing POST one-off send, a new GET HTML page, a new GET PDF download, and a new Vercel-cron handler driven by a new `agency_scheduled_reports` table. The editorial renderer stays behind `?template=editorial` for one release; the legacy fallback is deleted.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React, `@react-pdf/renderer` v4.5.1, Supabase, NextAuth v5 (existing), Vercel Cron (already wired), Tailwind CSS v4 with project navy/gold tokens.

---

## File Structure

**Create:**
- `lib/pdf/intel-report-tokens.ts` — Plain shared design tokens (colors, type scale, spacing). Single source of truth consumed by both the PDF renderer and the HTML view.
- `lib/pdf/intel-report-render.tsx` — Plain `@react-pdf/renderer` document. Default template.
- `lib/intel/intel-report-view.tsx` — Plain React/HTML view rendering the same report on screen.
- `lib/intel/render-utils.ts` — Pure helpers for stage labels, owner presence, lede counters. Shared by both renderers.
- `lib/intel/prepare-report.ts` — Core function returning `{ data, pdfBuffer, htmlElement, subject, filename, emailHtml, emailText, recipientName }`.
- `lib/intel/schedule-utils.ts` — Pure functions: `computeNextRunAt(frequency, day_of_week, day_of_month, send_hour, timezone, from?)`.
- `lib/intel/resolve-active-dg.ts` — Resolves the active DG user id and name from `users`. Reused by `prepareReport` and the cron handler reassignment path.
- `app/intel/[agency]/report/page.tsx` — Server page: renders the HTML view + the schedule list for the agency.
- `app/intel/[agency]/report/ScheduleList.tsx` — Client component listing existing schedules with pause/edit/delete.
- `app/api/intel/[agency]/report.pdf/route.ts` — GET PDF download.
- `app/api/intel/[agency]/schedules/route.ts` — GET (list), POST (create).
- `app/api/intel/[agency]/schedules/[id]/route.ts` — PATCH (update / pause), DELETE.
- `app/api/cron/agency-scheduled-reports/route.ts` — Vercel-cron handler.
- `supabase/migrations/125_agency_scheduled_reports.sql` — New table + indexes + RLS + `agency_intel_reports.source` column.

**Modify:**
- `app/api/intel/[agency]/report/route.ts` — Refactor to call `prepareReport`. Apply rate limit only when `source = 'manual'`. Remove `?template=legacy` branch. Keep `?template=editorial` flag.
- `components/intel/GenerateReportModal.tsx` — Add `mode: 'once' | 'schedule'` toggle, frequency + day + send-hour inputs, edit support.
- `vercel.json` — Add one cron entry.
- `lib/pdf/intel-brief-render.tsx` — Untouched on the inside, but the route now only invokes it when `?template=editorial`. No code changes.

**Delete:**
- `lib/pdf/agency-intel-report.tsx` — Legacy renderer.
- Any code branch referencing `?template=legacy` (only in `app/api/intel/[agency]/report/route.ts:121–122`).

---

## Phase A — Shared foundation: tokens, utils, renderers

### Task 1: Create the plain shared token module

**Files:**
- Create: `lib/pdf/intel-report-tokens.ts`

- [ ] **Step 1: Write the token module**

Token values are framework-agnostic numbers and hex strings. The PDF renderer reads `.size` as a number; the HTML view formats them as `${n}px`.

```typescript
// lib/pdf/intel-report-tokens.ts
//
// Plain shared design tokens for the Agency Intel Report.
// Both the PDF renderer (lib/pdf/intel-report-render.tsx) and the on-screen
// HTML view (lib/intel/intel-report-view.tsx) consume this module so the
// document looks the same in both contexts.

export const FONT_FAMILY = 'Inter';

export const COLORS = {
  paper: '#ffffff',
  ink: '#0f172a',
  body: '#1e293b',
  muted: '#64748b',
  mutedDeep: '#475569',
  rule: '#e2e8f0',
  accent: '#b88a1a',
  overdue: '#b91c1c',
} as const;

export const TYPE = {
  title:        { size: 24, weight: 700, lineHeight: 1.2, letterSpacing: -0.3 },
  subtitle:     { size: 11, weight: 400, lineHeight: 1.4, letterSpacing: 0.4, uppercase: true },
  sectionLabel: { size: 13, weight: 600, lineHeight: 1.2, letterSpacing: 0.6, uppercase: true },
  itemTitle:    { size: 12, weight: 600, lineHeight: 1.35 },
  body:         { size: 11, weight: 400, lineHeight: 1.5 },
  meta:         { size: 10, weight: 400, lineHeight: 1.4 },
  metaEmphasis: { size: 10, weight: 600, lineHeight: 1.4 },
  statNumber:   { size: 22, weight: 600, lineHeight: 1.1 },
  statLabel:    { size: 10, weight: 400, lineHeight: 1.4, letterSpacing: 0.4, uppercase: true },
  footer:       { size: 9,  weight: 400, lineHeight: 1.4 },
} as const;

export const SPACE = {
  pageMargin: 48,
  headerToStats: 24,
  statsToFirstSection: 32,
  sectionGap: 28,
  sectionHeaderToFirstItem: 12,
  itemGap: 12,
  itemInnerGap: 4,
  ruleThickness: 0.5,
} as const;

export const PAGE = {
  marginX: SPACE.pageMargin,
  marginTop: SPACE.pageMargin,
  marginBottom: SPACE.pageMargin + 16,
} as const;

export type TokenKey = keyof typeof TYPE;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/intel-report-tokens.ts
git commit -m "feat(intel-report): add plain shared design tokens"
```

---

### Task 2: Create render utilities (pure helpers)

**Files:**
- Create: `lib/intel/render-utils.ts`

These are the helpers both renderers and the lede recomputation need. They encode the field-vs-record discipline.

- [ ] **Step 1: Write the helpers**

```typescript
// lib/intel/render-utils.ts
//
// Pure helpers for the plain intel report. No JSX, no react-pdf.
// Used by lib/pdf/intel-report-render.tsx, lib/intel/intel-report-view.tsx,
// and lib/intel/prepare-report.ts.

import type {
  AgencyIntelData,
  CriticalTender,
  DelayedProject,
  OpenTask,
} from '@/lib/intel/get-agency-intel-data';

// Placeholder owner strings used historically when a focal point was not yet
// assigned. Treat these as explicit "no named owner" markers.
const PLACEHOLDER_OWNER_RE = /^(tbd|pending|pending\s+assignment|unassigned|n\/a|none|to\s+be\s+assigned)$/i;

export function isPresentOwner(value: string | null | undefined): value is string {
  if (value == null) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return !PLACEHOLDER_OWNER_RE.test(trimmed);
}

export function isExplicitPlaceholderOwner(value: string | null | undefined): boolean {
  if (value == null) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return PLACEHOLDER_OWNER_RE.test(trimmed);
}

// Stage labels for procurement. If the DB enum extends without us, we
// humanize the raw value rather than printing snake_case. No fallback string.
const STAGE_LABELS: Record<string, string> = {
  preparation: 'Preparation',
  advertised: 'Advertised',
  bids_open: 'Bids open',
  bids_received: 'Bids received',
  evaluation: 'Under evaluation',
  award_recommended: 'Award recommended',
  awarded: 'Awarded',
  contract_signed: 'Contract signed',
  cancelled: 'Cancelled',
};

export function stageLabel(stage: string | null | undefined): string {
  if (stage == null) return '';
  const known = STAGE_LABELS[stage];
  if (known) return known;
  return stage
    .split('_')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export type LedeStats = {
  openTasksTotal: number;
  openTasksOverdue: number;
  delayedProjectsTotal: number;
  delayedTotalDaysSlip: number;
  procurementTotal: number;
  procurementUnnamed: number;
};

export function computeLedeStats(data: AgencyIntelData): LedeStats {
  const tasks = data.open_tasks ?? [];
  const projects = data.delayed_projects ?? [];
  const tenders = data.critical_procurement ?? [];

  const openTasksTotal = tasks.length;
  const openTasksOverdue = tasks.filter((t: OpenTask) => t.is_overdue === true).length;

  const delayedProjectsTotal = projects.length;
  const delayedTotalDaysSlip = projects.reduce(
    (sum: number, p: DelayedProject) =>
      sum + (typeof p.days_overdue === 'number' && p.days_overdue > 0 ? p.days_overdue : 0),
    0,
  );

  const procurementTotal = tenders.length;
  // Ruling 4: count tenders whose owner is an explicit placeholder. Do NOT
  // count tenders whose owner is null (those are absent data, not unnamed).
  const procurementUnnamed = tenders.filter(
    (t: CriticalTender) => isExplicitPlaceholderOwner(t.next_action_owner),
  ).length;

  return {
    openTasksTotal,
    openTasksOverdue,
    delayedProjectsTotal,
    delayedTotalDaysSlip,
    procurementTotal,
    procurementUnnamed,
  };
}

export function formatGYD(valueCents: number | null | undefined): string | null {
  if (typeof valueCents !== 'number') return null;
  const dollars = valueCents / 100;
  return new Intl.NumberFormat('en-GY', {
    style: 'currency',
    currency: 'GYD',
    maximumFractionDigits: 0,
  }).format(dollars);
}

export function formatDueDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GY', { day: '2-digit', month: 'short', year: 'numeric' });
}
```

- [ ] **Step 2: Write tests for the pure logic**

Create: `lib/intel/render-utils.test.ts`

```typescript
import { describe, expect, test } from 'vitest';
import {
  computeLedeStats,
  formatDueDate,
  formatGYD,
  isExplicitPlaceholderOwner,
  isPresentOwner,
  stageLabel,
} from './render-utils';

describe('isPresentOwner', () => {
  test('null is not present', () => { expect(isPresentOwner(null)).toBe(false); });
  test('undefined is not present', () => { expect(isPresentOwner(undefined)).toBe(false); });
  test('empty string is not present', () => { expect(isPresentOwner('')).toBe(false); });
  test('whitespace is not present', () => { expect(isPresentOwner('   ')).toBe(false); });
  test('placeholder TBD is not present', () => { expect(isPresentOwner('TBD')).toBe(false); });
  test('placeholder Pending Assignment is not present', () => { expect(isPresentOwner('Pending Assignment')).toBe(false); });
  test('real name is present', () => { expect(isPresentOwner('Aisha Khan')).toBe(true); });
});

describe('isExplicitPlaceholderOwner', () => {
  test('null is not explicit', () => { expect(isExplicitPlaceholderOwner(null)).toBe(false); });
  test('TBD is explicit', () => { expect(isExplicitPlaceholderOwner('TBD')).toBe(true); });
  test('real name is not explicit', () => { expect(isExplicitPlaceholderOwner('Aisha Khan')).toBe(false); });
});

describe('stageLabel', () => {
  test('known stage maps to label', () => { expect(stageLabel('bids_open')).toBe('Bids open'); });
  test('unknown stage is humanized, not raw', () => { expect(stageLabel('post_award_review')).toBe('Post Award Review'); });
  test('null is empty string', () => { expect(stageLabel(null)).toBe(''); });
});

describe('computeLedeStats', () => {
  test('procurement unnamed counts placeholders only, not null', () => {
    const data = {
      open_tasks: [],
      delayed_projects: [],
      critical_procurement: [
        { next_action_owner: 'Aisha Khan' },
        { next_action_owner: null },
        { next_action_owner: 'TBD' },
        { next_action_owner: 'Pending Assignment' },
      ],
    } as never;
    const stats = computeLedeStats(data);
    expect(stats.procurementTotal).toBe(4);
    expect(stats.procurementUnnamed).toBe(2);
  });

  test('delayed slip excludes null days_overdue', () => {
    const data = {
      open_tasks: [],
      delayed_projects: [
        { days_overdue: 10 },
        { days_overdue: null },
        { days_overdue: 5 },
        { days_overdue: 0 },
      ],
      critical_procurement: [],
    } as never;
    const stats = computeLedeStats(data);
    expect(stats.delayedTotalDaysSlip).toBe(15);
  });
});

describe('formatGYD', () => {
  test('formats cents', () => {
    const out = formatGYD(123456789);
    expect(out).toMatch(/GYD/);
    expect(out).toMatch(/1,234,567/);
  });
  test('null is null', () => { expect(formatGYD(null)).toBeNull(); });
  test('undefined is null', () => { expect(formatGYD(undefined)).toBeNull(); });
});

describe('formatDueDate', () => {
  test('iso is formatted', () => {
    const out = formatDueDate('2026-05-28');
    expect(out).not.toBeNull();
    expect(out).toMatch(/2026/);
  });
  test('null is null', () => { expect(formatDueDate(null)).toBeNull(); });
  test('invalid is null', () => { expect(formatDueDate('not-a-date')).toBeNull(); });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/intel/render-utils.test.ts`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add lib/intel/render-utils.ts lib/intel/render-utils.test.ts
git commit -m "feat(intel-report): add pure render helpers with field-vs-record logic"
```

---

### Task 3: Create the plain react-pdf renderer

**Files:**
- Create: `lib/pdf/intel-report-render.tsx`

This is the plain default PDF. It uses the tokens from Task 1 and the helpers from Task 2. It renders three sections: Open Tasks, Delayed Projects, Procurement Attention. Empty sections do not render. Missing fields disappear; records are never suppressed for a missing field.

- [ ] **Step 1: Write the file skeleton**

The structure mirrors the editorial renderer at `lib/pdf/intel-brief-render.tsx:579–614` for the document/page bootstrapping and `:603–613` for the buffer streaming. Reuse the `Font.register()` calls verbatim from `intel-brief-render.tsx:24–38` since Inter is already in `public/fonts`.

```tsx
// lib/pdf/intel-report-render.tsx
//
// Plain Agency Intel Report renderer. Default template. The editorial
// magazine treatment stays behind `?template=editorial` for one release.

import path from 'node:path';
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';
import * as React from 'react';

import type { AgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { COLORS, FONT_FAMILY, PAGE, SPACE, TYPE } from './intel-report-tokens';
import {
  computeLedeStats,
  formatDueDate,
  formatGYD,
  isPresentOwner,
  stageLabel,
} from '@/lib/intel/render-utils';

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: FONT_FAMILY,
  fonts: [
    { src: path.join(FONT_DIR, 'Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'Inter-Medium.ttf'),  fontWeight: 500 },
    { src: path.join(FONT_DIR, 'Inter-SemiBold.ttf'), fontWeight: 600 },
    { src: path.join(FONT_DIR, 'Inter-Bold.ttf'),    fontWeight: 700 },
  ],
});

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
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.accent,
  },
  itemStatLabel: {
    fontSize: 9,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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

function StatsStrip({ stats }: { stats: ReturnType<typeof computeLedeStats> }) {
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

function OpenTasksSection({ data, stats }: { data: AgencyIntelData; stats: ReturnType<typeof computeLedeStats> }) {
  const tasks = data.open_tasks ?? [];
  if (tasks.length === 0) return null;
  const lede =
    stats.openTasksOverdue > 0
      ? `${stats.openTasksTotal} open, ${stats.openTasksOverdue} overdue.`
      : `${stats.openTasksTotal} open.`;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Open Tasks</Text>
      <Text style={styles.sectionLede}>{lede}</Text>
      {tasks.map((t, i) => {
        const due = formatDueDate(t.due_date);
        const metaParts: string[] = [t.status?.toUpperCase() ?? 'OPEN'];
        if (due) metaParts.push(`Due ${due}`);
        const metaStyle = t.is_overdue ? styles.itemMetaOverdue : styles.itemMeta;
        return (
          <View key={`task-${i}`} style={styles.item}>
            <Text style={styles.itemTitle}>{t.title ?? ''}</Text>
            <Text style={metaStyle}>{metaParts.join('  ·  ')}{t.is_overdue ? '  ·  Overdue' : ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

function DelayedProjectsSection({ data, stats }: { data: AgencyIntelData; stats: ReturnType<typeof computeLedeStats> }) {
  const projects = data.delayed_projects ?? [];
  if (projects.length === 0) return null;
  const lede =
    stats.delayedTotalDaysSlip > 0
      ? `${stats.delayedProjectsTotal} projects late, ${stats.delayedTotalDaysSlip} total days of slip.`
      : `${stats.delayedProjectsTotal} projects late.`;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Delayed Projects</Text>
      <Text style={styles.sectionLede}>{lede}</Text>
      {projects.map((p, i) => {
        const value = formatGYD(p.contract_value);
        const stats: { num: string; label: string }[] = [];
        if (typeof p.completion_percent === 'number') {
          stats.push({ num: `${Math.round(p.completion_percent)}%`, label: 'Complete' });
        }
        if (typeof p.days_overdue === 'number' && p.days_overdue > 0) {
          stats.push({ num: String(p.days_overdue), label: 'Days overdue' });
        }
        if (value) {
          stats.push({ num: value, label: 'Value' });
        }
        return (
          <View key={`proj-${i}`} style={styles.item}>
            <Text style={styles.itemTitle}>{p.project_name ?? ''}</Text>
            {isPresentOwner(p.contractors) && (
              <Text style={styles.itemMeta}>{p.contractors}</Text>
            )}
            {stats.length > 0 && (
              <View style={styles.itemStatRow}>
                {stats.map((s, j) => (
                  <View key={`stat-${j}`} style={styles.itemStatCell}>
                    <Text style={styles.itemStatNumber}>{s.num}</Text>
                    <Text style={styles.itemStatLabel}>{s.label}</Text>
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

function ProcurementSection({ data, stats }: { data: AgencyIntelData; stats: ReturnType<typeof computeLedeStats> }) {
  const tenders = data.critical_procurement ?? [];
  if (tenders.length === 0) return null;
  const lede =
    stats.procurementUnnamed > 0
      ? `${stats.procurementTotal} procurements, ${stats.procurementUnnamed} without a named next-action owner.`
      : `${stats.procurementTotal} procurements.`;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Procurement Attention</Text>
      <Text style={styles.sectionLede}>{lede}</Text>
      {tenders.map((t, i) => {
        const stage = stageLabel(t.stage);
        const metaParts: string[] = [];
        if (stage) metaParts.push(stage);
        if (typeof t.days_in_stage === 'number') metaParts.push(`${t.days_in_stage} days in stage`);
        if (isPresentOwner(t.next_action_owner)) metaParts.push(`Next: ${t.next_action_owner}`);
        return (
          <View key={`proc-${i}`} style={styles.item}>
            <Text style={styles.itemTitle}>{t.description ?? ''}</Text>
            {metaParts.length > 0 && (
              <Text style={styles.itemMeta}>{metaParts.join('  ·  ')}</Text>
            )}
            {t.reason && (
              <Text style={styles.itemMeta}>{t.reason}</Text>
            )}
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
      <Text>{agencyDisplayName} Intel Report  ·  {generated}</Text>
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
  const stream = await pdf(<IntelReportDocument {...props} />).toBuffer();
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean. If `AgencyIntelData` field names differ from the references above (`open_tasks`, `delayed_projects`, `critical_procurement`, `is_overdue`, `next_action_owner`, `days_in_stage`, `contract_value`), align the renderer to the actual type by reading `lib/intel/get-agency-intel-data.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/intel-report-render.tsx
git commit -m "feat(intel-report): add plain react-pdf renderer"
```

---

### Task 4: Create the on-screen HTML view component

**Files:**
- Create: `lib/intel/intel-report-view.tsx`

Same tokens, same helpers, plain inline-styled React. The page lives white-on-white inside the navy app shell so it reads as a document, not a dashboard.

- [ ] **Step 1: Write the component**

```tsx
// lib/intel/intel-report-view.tsx
//
// HTML/React view of the Agency Intel Report. Renders the same content as
// lib/pdf/intel-report-render.tsx, consuming the same plain tokens. The
// design lives once; the PDF mirrors this view.

import * as React from 'react';

import type { AgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { COLORS, PAGE, SPACE, TYPE } from '@/lib/pdf/intel-report-tokens';
import {
  computeLedeStats,
  formatDueDate,
  formatGYD,
  isPresentOwner,
  stageLabel,
} from '@/lib/intel/render-utils';

type Props = {
  agencyDisplayName: string;
  recipientName: string;
  generatedAt: Date;
  data: AgencyIntelData;
};

function px(n: number) { return `${n}px`; }

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
    padding: `12px 0`,
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
  sectionLede: { fontSize: px(TYPE.body.size), color: COLORS.mutedDeep, marginBottom: 10 },
  item: {
    borderTop: `${SPACE.ruleThickness}px solid ${COLORS.rule}`,
    padding: '10px 0',
  },
  itemTitle: { fontSize: px(TYPE.itemTitle.size), fontWeight: TYPE.itemTitle.weight, color: COLORS.ink },
  itemMeta: { fontSize: px(TYPE.meta.size), color: COLORS.muted, marginTop: 4 },
  itemMetaOverdue: { fontSize: px(TYPE.meta.size), color: COLORS.overdue, marginTop: 4 },
  itemStatRow: { display: 'flex', gap: 20, marginTop: 6 },
  itemStatNumber: { fontSize: '14px', fontWeight: 600, color: COLORS.accent },
  itemStatLabel: { fontSize: '9px', color: COLORS.muted, textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginTop: 2 },
};

export function IntelReportView({ agencyDisplayName, recipientName, generatedAt, data }: Props) {
  const stats = computeLedeStats(data);
  const generated = generatedAt.toLocaleDateString('en-GY', { day: '2-digit', month: 'long', year: 'numeric' });
  return (
    <article style={s.paper}>
      <header>
        <h1 style={s.title}>{agencyDisplayName} Intel Report</h1>
        <div style={s.subtitle}>Ministry of Public Utilities and Aviation</div>
        <div style={s.generated}>Prepared {generated} for {recipientName}</div>
      </header>
      <div style={s.stats}>
        <div><div style={s.statNumber}>{stats.openTasksTotal}</div><div style={s.statLabel}>Open tasks</div></div>
        <div><div style={s.statNumber}>{stats.delayedProjectsTotal}</div><div style={s.statLabel}>Delayed projects</div></div>
        <div><div style={s.statNumber}>{stats.procurementTotal}</div><div style={s.statLabel}>Procurement attention</div></div>
      </div>
      <OpenTasks data={data} stats={stats} />
      <DelayedProjects data={data} stats={stats} />
      <Procurement data={data} stats={stats} />
    </article>
  );
}

function OpenTasks({ data, stats }: { data: AgencyIntelData; stats: ReturnType<typeof computeLedeStats> }) {
  const tasks = data.open_tasks ?? [];
  if (tasks.length === 0) return null;
  const lede = stats.openTasksOverdue > 0
    ? `${stats.openTasksTotal} open, ${stats.openTasksOverdue} overdue.`
    : `${stats.openTasksTotal} open.`;
  return (
    <section style={s.section}>
      <h2 style={s.sectionLabel}>Open Tasks</h2>
      <div style={s.sectionLede}>{lede}</div>
      {tasks.map((t, i) => {
        const due = formatDueDate(t.due_date);
        const parts: string[] = [t.status?.toUpperCase() ?? 'OPEN'];
        if (due) parts.push(`Due ${due}`);
        return (
          <div key={i} style={s.item}>
            <div style={s.itemTitle}>{t.title ?? ''}</div>
            <div style={t.is_overdue ? s.itemMetaOverdue : s.itemMeta}>
              {parts.join('  ·  ')}{t.is_overdue ? '  ·  Overdue' : ''}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DelayedProjects({ data, stats }: { data: AgencyIntelData; stats: ReturnType<typeof computeLedeStats> }) {
  const projects = data.delayed_projects ?? [];
  if (projects.length === 0) return null;
  const lede = stats.delayedTotalDaysSlip > 0
    ? `${stats.delayedProjectsTotal} projects late, ${stats.delayedTotalDaysSlip} total days of slip.`
    : `${stats.delayedProjectsTotal} projects late.`;
  return (
    <section style={s.section}>
      <h2 style={s.sectionLabel}>Delayed Projects</h2>
      <div style={s.sectionLede}>{lede}</div>
      {projects.map((p, i) => {
        const value = formatGYD(p.contract_value);
        const cells: { num: string; label: string }[] = [];
        if (typeof p.completion_percent === 'number') cells.push({ num: `${Math.round(p.completion_percent)}%`, label: 'Complete' });
        if (typeof p.days_overdue === 'number' && p.days_overdue > 0) cells.push({ num: String(p.days_overdue), label: 'Days overdue' });
        if (value) cells.push({ num: value, label: 'Value' });
        return (
          <div key={i} style={s.item}>
            <div style={s.itemTitle}>{p.project_name ?? ''}</div>
            {isPresentOwner(p.contractors) && <div style={s.itemMeta}>{p.contractors}</div>}
            {cells.length > 0 && (
              <div style={s.itemStatRow}>
                {cells.map((c, j) => (
                  <div key={j}>
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

function Procurement({ data, stats }: { data: AgencyIntelData; stats: ReturnType<typeof computeLedeStats> }) {
  const tenders = data.critical_procurement ?? [];
  if (tenders.length === 0) return null;
  const lede = stats.procurementUnnamed > 0
    ? `${stats.procurementTotal} procurements, ${stats.procurementUnnamed} without a named next-action owner.`
    : `${stats.procurementTotal} procurements.`;
  return (
    <section style={s.section}>
      <h2 style={s.sectionLabel}>Procurement Attention</h2>
      <div style={s.sectionLede}>{lede}</div>
      {tenders.map((t, i) => {
        const stage = stageLabel(t.stage);
        const meta: string[] = [];
        if (stage) meta.push(stage);
        if (typeof t.days_in_stage === 'number') meta.push(`${t.days_in_stage} days in stage`);
        if (isPresentOwner(t.next_action_owner)) meta.push(`Next: ${t.next_action_owner}`);
        return (
          <div key={i} style={s.item}>
            <div style={s.itemTitle}>{t.description ?? ''}</div>
            {meta.length > 0 && <div style={s.itemMeta}>{meta.join('  ·  ')}</div>}
            {t.reason && <div style={s.itemMeta}>{t.reason}</div>}
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/intel/intel-report-view.tsx
git commit -m "feat(intel-report): add on-screen HTML view sharing tokens with PDF"
```

---

## Phase B — Core extraction

### Task 5: Resolve active DG helper

**Files:**
- Create: `lib/intel/resolve-active-dg.ts`

The existing `resolveDGRecipientName` lives in `app/api/intel/[agency]/report/route.ts`. Extract its logic into a reusable helper that returns both id and name. The cron reassignment path (Task 13) needs the id; the report header needs the name.

- [ ] **Step 1: Read the existing resolver**

Read `app/api/intel/[agency]/report/route.ts` and locate `resolveDGRecipientName`. Note the query and the fallback behaviour.

- [ ] **Step 2: Write the helper**

```typescript
// lib/intel/resolve-active-dg.ts
//
// Resolves the active DG user. Used by prepareReport to label the report
// recipient, and by the cron handler when a schedule's creator has been
// deactivated.

import { supabaseAdmin } from '@/lib/db';

export type ResolvedDG = { userId: string | null; name: string };

const FALLBACK_NAME = 'Director General';

export async function resolveActiveDG(): Promise<ResolvedDG> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('role', 'dg')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { userId: null, name: FALLBACK_NAME };
  return { userId: data.id, name: data.name ?? FALLBACK_NAME };
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/intel/resolve-active-dg.ts
git commit -m "feat(intel-report): add resolve-active-dg helper"
```

---

### Task 6: Extract prepareReport core

**Files:**
- Create: `lib/intel/prepare-report.ts`

This is the seam that prevents drift. Every consumer (POST, GET page, GET PDF, cron) goes through this single function.

- [ ] **Step 1: Read the current route**

Read `app/api/intel/[agency]/report/route.ts` in full so the extraction matches the current behaviour. Note: agency display-name resolution, subject line shape, email HTML/text templating, attachment filename convention.

- [ ] **Step 2: Write prepareReport**

```typescript
// lib/intel/prepare-report.ts
//
// Single render core for the Agency Intel Report. All four consumers
// (POST one-off send, GET on-screen, GET PDF download, scheduled cron)
// go through this function so their output cannot drift.

import * as React from 'react';

import { getAgencyIntelData, type AgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { renderIntelReportPDF } from '@/lib/pdf/intel-report-render';
import { renderIntelBriefPDF } from '@/lib/pdf/intel-brief-render';
import { IntelReportView } from '@/lib/intel/intel-report-view';
import { resolveActiveDG } from '@/lib/intel/resolve-active-dg';

export type ReportTemplate = 'plain' | 'editorial';

export type PreparedReport = {
  data: AgencyIntelData;
  pdfBuffer: Buffer;
  htmlElement: React.ReactElement;
  subject: string;
  filename: string;
  emailHtml: string;
  emailText: string;
  recipientName: string;
  recipientUserId: string | null;
  agencyDisplayName: string;
  generatedAt: Date;
};

const AGENCY_DISPLAY_NAMES: Record<string, string> = {
  GPL: 'Guyana Power and Light',
  GWI: 'Guyana Water Inc.',
  CJIA: 'Cheddi Jagan International Airport',
  GCAA: 'Guyana Civil Aviation Authority',
  HAS: 'Hinterland Airstrips',
  MARAD: 'Maritime Administration',
};

function displayName(agencyUpper: string): string {
  return AGENCY_DISPLAY_NAMES[agencyUpper] ?? agencyUpper;
}

function dateStamp(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildEmailBodies(args: {
  agencyDisplayName: string;
  recipientName: string;
  generatedAt: Date;
  coverMessage?: string | null;
}): { emailHtml: string; emailText: string } {
  const generated = args.generatedAt.toLocaleDateString('en-GY', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const cover = (args.coverMessage ?? '').trim();
  const greeting = `Good day, ${args.recipientName}.`;
  const intro = `Attached is the ${args.agencyDisplayName} Intel Report, prepared ${generated}.`;

  const htmlCover = cover ? `<p style="margin:0 0 12px 0">${escapeHtml(cover)}</p>` : '';
  const emailHtml = `
    <div style="font-family:Inter,system-ui,sans-serif;color:#0f172a;font-size:14px;line-height:1.6">
      <p style="margin:0 0 12px 0">${escapeHtml(greeting)}</p>
      ${htmlCover}
      <p style="margin:0 0 12px 0">${escapeHtml(intro)}</p>
      <p style="margin:0;color:#64748b;font-size:12px">Ministry of Public Utilities and Aviation</p>
    </div>
  `;

  const textCover = cover ? `${cover}\n\n` : '';
  const emailText = `${greeting}\n\n${textCover}${intro}\n\nMinistry of Public Utilities and Aviation`;

  return { emailHtml, emailText };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function prepareReport(args: {
  agency: string;
  template?: ReportTemplate;
  coverMessage?: string | null;
}): Promise<PreparedReport> {
  const template: ReportTemplate = args.template ?? 'plain';
  const agencyUpper = args.agency.toUpperCase();
  const agencyDisplayName = displayName(agencyUpper);

  const [data, dg] = await Promise.all([
    getAgencyIntelData(agencyUpper),
    resolveActiveDG(),
  ]);

  const generatedAt = new Date();

  let pdfBuffer: Buffer;
  if (template === 'editorial') {
    pdfBuffer = await renderIntelBriefPDF({
      agencyDisplayName,
      recipientName: dg.name,
      generatedAt,
      data,
    });
  } else {
    const { renderIntelReportPDF: render } = await import('@/lib/pdf/intel-report-render');
    pdfBuffer = await render({
      agencyDisplayName,
      recipientName: dg.name,
      generatedAt,
      data,
    });
  }

  const htmlElement = React.createElement(IntelReportView, {
    agencyDisplayName,
    recipientName: dg.name,
    generatedAt,
    data,
  });

  const subject = `${agencyDisplayName} Intel Report  ·  ${dateStamp(generatedAt)}`;
  const filename = `${agencyUpper}-intel-report-${dateStamp(generatedAt)}.pdf`;
  const { emailHtml, emailText } = buildEmailBodies({
    agencyDisplayName,
    recipientName: dg.name,
    generatedAt,
    coverMessage: args.coverMessage,
  });

  return {
    data,
    pdfBuffer,
    htmlElement,
    subject,
    filename,
    emailHtml,
    emailText,
    recipientName: dg.name,
    recipientUserId: dg.userId,
    agencyDisplayName,
    generatedAt,
  };
}
```

If `renderIntelBriefPDF` is not currently exported with this signature from `lib/pdf/intel-brief-render.tsx`, adapt the import. Match the existing exported function.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/intel/prepare-report.ts
git commit -m "feat(intel-report): add prepareReport core consumed by all sends"
```

---

### Task 7: Refactor POST route to use prepareReport

**Files:**
- Modify: `app/api/intel/[agency]/report/route.ts`

Keep the rate limit (10/hr/user) and audit insert in the route. Move render + email body construction into `prepareReport`. Drop the `?template=legacy` branch entirely. Keep `?template=editorial`.

- [ ] **Step 1: Edit the route**

Replace the existing render + email-body block (per investigation, `:109–173`) with calls into `prepareReport`. Pseudocode of the final structure:

```typescript
// app/api/intel/[agency]/report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { sendEmail } from '@/lib/email';
import { supabaseAdmin } from '@/lib/db';
import { prepareReport, type ReportTemplate } from '@/lib/intel/prepare-report';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: Promise<{ agency: string }> }) {
  const { agency } = await ctx.params;
  const session = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (!canAccessAgency(session.user.role, session.user.agency, agency.toUpperCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const template: ReportTemplate = url.searchParams.get('template') === 'editorial' ? 'editorial' : 'plain';

  const body = await req.json().catch(() => ({}));
  const recipients: string[] = Array.isArray(body.recipients) ? body.recipients : [];
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'recipients_required' }, { status: 400 });
  }
  const coverMessage: string | null = typeof body.message === 'string' ? body.message : null;

  // Rate limit: 10 manual sends per rolling hour per user.
  const { count } = await supabaseAdmin
    .from('agency_intel_reports')
    .select('id', { count: 'exact', head: true })
    .eq('sent_by_user_id', session.user.id)
    .eq('source', 'manual')
    .gt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const prepared = await prepareReport({ agency, template, coverMessage });

  await sendEmail({
    to: recipients,
    subject: prepared.subject,
    html: prepared.emailHtml,
    text: prepared.emailText,
    attachments: [{ filename: prepared.filename, content: prepared.pdfBuffer, contentType: 'application/pdf' }],
  });

  await supabaseAdmin.from('agency_intel_reports').insert({
    agency: agency.toUpperCase(),
    sent_by_user_id: session.user.id,
    recipients,
    source: 'manual',
    template,
  });

  return NextResponse.json({ ok: true });
}
```

Adjust the import paths and field names to match the actual project. The intent is: identical observable behaviour for the one-off send, with `?template=legacy` removed and `?template=editorial` preserved.

- [ ] **Step 2: Smoke test the existing flow**

From the project root, start the dev server (`pnpm dev` or `npm run dev` per local convention), authenticate as a DG/PS user, open `/intel/gpl`, send a one-off report via the existing modal, verify the email arrives and the audit row appears in `agency_intel_reports` with `source = 'manual'`.

- [ ] **Step 3: Commit**

```bash
git add app/api/intel/[agency]/report/route.ts
git commit -m "refactor(intel-report): route POST send through prepareReport"
```

---

### Task 8: Delete the legacy renderer

**Files:**
- Delete: `lib/pdf/agency-intel-report.tsx`

- [ ] **Step 1: Confirm no callers remain**

```bash
grep -RIn "agency-intel-report" --include='*.ts' --include='*.tsx' app lib components
grep -RIn "renderAgencyIntelReportPDF" --include='*.ts' --include='*.tsx' app lib components
```

Expected: only the file itself, after the Task 7 refactor.

- [ ] **Step 2: Delete the file**

```bash
git rm lib/pdf/agency-intel-report.tsx
```

- [ ] **Step 3: Re-run the grep**

Expected: zero references.

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(intel-report): delete legacy renderer"
```

---

## Phase C — Direct access

### Task 9: GET PDF download endpoint

**Files:**
- Create: `app/api/intel/[agency]/report.pdf/route.ts`

Read-only, no rate limit, same auth.

- [ ] **Step 1: Write the route**

```typescript
// app/api/intel/[agency]/report.pdf/route.ts
//
// Direct PDF download. Auth-gated by the same canAccessAgency rule as the
// view page. No rate limit (read-only).

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { prepareReport, type ReportTemplate } from '@/lib/intel/prepare-report';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: NextRequest, ctx: { params: Promise<{ agency: string }> }) {
  const { agency } = await ctx.params;
  const session = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (!canAccessAgency(session.user.role, session.user.agency, agency.toUpperCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const template: ReportTemplate = url.searchParams.get('template') === 'editorial' ? 'editorial' : 'plain';
  const prepared = await prepareReport({ agency, template });

  return new NextResponse(prepared.pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${prepared.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
```

- [ ] **Step 2: Manual verification**

In the dev server, navigate to `/api/intel/gpl/report.pdf` while signed in. Expected: PDF downloads. Sign in as an agency_admin from a different agency, navigate to the same URL. Expected: 403.

- [ ] **Step 3: Commit**

```bash
git add app/api/intel/[agency]/report.pdf/route.ts
git commit -m "feat(intel-report): add GET /report.pdf download endpoint"
```

---

### Task 10: On-screen report page

**Files:**
- Create: `app/intel/[agency]/report/page.tsx`
- Create: `app/intel/[agency]/report/DownloadButton.tsx`

The page renders the HTML view and includes a download link plus the schedule list (Schedule list lives in Task 16; for now stub it with a placeholder element so Tasks 9 and 10 can be exercised without scheduling complete).

- [ ] **Step 1: Write the page**

```tsx
// app/intel/[agency]/report/page.tsx
import { redirect } from 'next/navigation';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { prepareReport } from '@/lib/intel/prepare-report';
import { DownloadButton } from './DownloadButton';
import { ScheduleList } from './ScheduleList';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }: { params: Promise<{ agency: string }> }) {
  const { agency } = await params;
  const session = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (!canAccessAgency(session.user.role, session.user.agency, agency.toUpperCase())) {
    redirect('/');
  }
  const prepared = await prepareReport({ agency });
  return (
    <div className="min-h-screen bg-[var(--navy-950)] py-10">
      <div className="max-w-5xl mx-auto px-4 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {prepared.agencyDisplayName} Intel Report
          </h1>
          <p className="text-sm text-[var(--navy-600)] mt-1">
            View, download, or schedule this report.
          </p>
        </div>
        <DownloadButton agency={agency} />
      </div>
      {prepared.htmlElement}
      <div className="max-w-5xl mx-auto px-4 mt-10">
        <ScheduleList agency={agency} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the download button**

```tsx
// app/intel/[agency]/report/DownloadButton.tsx
'use client';

export function DownloadButton({ agency }: { agency: string }) {
  return (
    <a
      href={`/api/intel/${agency}/report.pdf`}
      className="btn-gold"
    >
      Download PDF
    </a>
  );
}
```

- [ ] **Step 3: Stub the ScheduleList component for now**

Create `app/intel/[agency]/report/ScheduleList.tsx`:

```tsx
// app/intel/[agency]/report/ScheduleList.tsx
'use client';

export function ScheduleList({ agency: _agency }: { agency: string }) {
  return null;
}
```

Task 16 replaces this stub with the real list.

- [ ] **Step 4: Manual verification**

Navigate to `/intel/gpl/report` while signed in. Expected: white-paper-on-navy report page renders, Download PDF works, no console errors.

- [ ] **Step 5: Commit**

```bash
git add app/intel/[agency]/report/page.tsx app/intel/[agency]/report/DownloadButton.tsx app/intel/[agency]/report/ScheduleList.tsx
git commit -m "feat(intel-report): add on-screen report page with download action"
```

---

## Phase D — Scheduling schema and core logic

### Task 11: Write the migration file

**Files:**
- Create: `supabase/migrations/125_agency_scheduled_reports.sql`

This file is for manual execution. Do not run it from this plan. Write only.

- [ ] **Step 1: Write the SQL**

```sql
-- supabase/migrations/125_agency_scheduled_reports.sql
--
-- Adds the agency_scheduled_reports table for recurring email sends, and a
-- source column on agency_intel_reports to distinguish manual sends from
-- scheduled ones so the human rate limit only counts manual.

-- 1. Distinguish manual vs scheduled audit rows.
ALTER TABLE agency_intel_reports
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'scheduled'));

ALTER TABLE agency_intel_reports
  ADD COLUMN IF NOT EXISTS template TEXT NOT NULL DEFAULT 'plain'
  CHECK (template IN ('plain', 'editorial'));

CREATE INDEX IF NOT EXISTS idx_agency_intel_reports_user_source_created
  ON agency_intel_reports (sent_by_user_id, source, created_at DESC);

-- 2. New scheduled reports table.
CREATE TABLE IF NOT EXISTS agency_scheduled_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  agency                TEXT NOT NULL,
  recipients            TEXT[] NOT NULL CHECK (cardinality(recipients) > 0),
  cover_message         TEXT,
  frequency             TEXT NOT NULL CHECK (frequency IN ('weekly', 'fortnightly', 'monthly')),
  day_of_week           INT CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month          INT CHECK (day_of_month BETWEEN 1 AND 28),
  send_hour             INT NOT NULL DEFAULT 8 CHECK (send_hour BETWEEN 0 AND 23),
  timezone              TEXT NOT NULL DEFAULT 'America/Guyana',
  template              TEXT NOT NULL DEFAULT 'plain' CHECK (template IN ('plain', 'editorial')),
  active                BOOLEAN NOT NULL DEFAULT true,
  next_run_at           TIMESTAMPTZ NOT NULL,
  last_run_at           TIMESTAMPTZ,
  last_error            TEXT,
  last_error_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_scheduled_reports_active_next_run
  ON agency_scheduled_reports (active, next_run_at)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_agency_scheduled_reports_agency
  ON agency_scheduled_reports (agency);

CREATE INDEX IF NOT EXISTS idx_agency_scheduled_reports_created_by
  ON agency_scheduled_reports (created_by_user_id);

-- 3. RLS.
ALTER TABLE agency_scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY agency_scheduled_reports_select
  ON agency_scheduled_reports
  FOR SELECT
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('dg', 'minister', 'ps')
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('agency_admin', 'officer')
      AND u.agency = agency_scheduled_reports.agency
    )
  );

CREATE POLICY agency_scheduled_reports_insert
  ON agency_scheduled_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY agency_scheduled_reports_update
  ON agency_scheduled_reports
  FOR UPDATE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('dg', 'minister', 'ps'))
  )
  WITH CHECK (
    created_by_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('dg', 'minister', 'ps'))
  );

CREATE POLICY agency_scheduled_reports_delete
  ON agency_scheduled_reports
  FOR DELETE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('dg', 'minister', 'ps'))
  );

CREATE POLICY agency_scheduled_reports_service_all
  ON agency_scheduled_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. updated_at trigger.
CREATE OR REPLACE FUNCTION agency_scheduled_reports_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agency_scheduled_reports_updated_at ON agency_scheduled_reports;
CREATE TRIGGER trg_agency_scheduled_reports_updated_at
  BEFORE UPDATE ON agency_scheduled_reports
  FOR EACH ROW
  EXECUTE FUNCTION agency_scheduled_reports_set_updated_at();
```

- [ ] **Step 2: Do not run it**

The file is for manual execution. Do not execute. Commit only.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/125_agency_scheduled_reports.sql
git commit -m "feat(intel-report): migration 125 for scheduled reports table and source column"
```

---

### Task 12: schedule-utils with frequency math

**Files:**
- Create: `lib/intel/schedule-utils.ts`
- Create: `lib/intel/schedule-utils.test.ts`

Guyana is UTC-04, fixed, no DST. We can compute `next_run_at` in UTC by treating the configured local-clock hour as UTC-4. If the timezone column ever holds something else, switch to `Intl.DateTimeFormat`.

- [ ] **Step 1: Write the tests first**

```typescript
// lib/intel/schedule-utils.test.ts
import { describe, expect, test } from 'vitest';
import { computeNextRunAt } from './schedule-utils';

describe('computeNextRunAt — weekly', () => {
  test('next occurrence later this week', () => {
    // Monday 2026-06-01 14:00 UTC. Configured Wednesday (day_of_week=3) at 08:00 local (Guyana = UTC-4 so 12:00 UTC).
    const from = new Date('2026-06-01T14:00:00Z');
    const next = computeNextRunAt({ frequency: 'weekly', day_of_week: 3, send_hour: 8, timezone: 'America/Guyana' }, from);
    expect(next.toISOString()).toBe('2026-06-03T12:00:00.000Z');
  });

  test('next occurrence wraps to next week if today is past', () => {
    // Wednesday 2026-06-03 13:00 UTC (= 09:00 local). Configured Wednesday at 08:00 local. Already past.
    const from = new Date('2026-06-03T13:00:00Z');
    const next = computeNextRunAt({ frequency: 'weekly', day_of_week: 3, send_hour: 8, timezone: 'America/Guyana' }, from);
    expect(next.toISOString()).toBe('2026-06-10T12:00:00.000Z');
  });
});

describe('computeNextRunAt — fortnightly', () => {
  test('treats fortnightly as weekly + 7d on subsequent advancement', () => {
    const from = new Date('2026-06-01T14:00:00Z');
    const first = computeNextRunAt({ frequency: 'fortnightly', day_of_week: 3, send_hour: 8, timezone: 'America/Guyana' }, from);
    expect(first.toISOString()).toBe('2026-06-03T12:00:00.000Z');
    const second = computeNextRunAt({ frequency: 'fortnightly', day_of_week: 3, send_hour: 8, timezone: 'America/Guyana' }, first);
    expect(second.toISOString()).toBe('2026-06-17T12:00:00.000Z');
  });
});

describe('computeNextRunAt — monthly', () => {
  test('next occurrence later this month', () => {
    const from = new Date('2026-06-05T10:00:00Z');
    const next = computeNextRunAt({ frequency: 'monthly', day_of_month: 15, send_hour: 8, timezone: 'America/Guyana' }, from);
    expect(next.toISOString()).toBe('2026-06-15T12:00:00.000Z');
  });
  test('next occurrence rolls into next month if past', () => {
    const from = new Date('2026-06-16T10:00:00Z');
    const next = computeNextRunAt({ frequency: 'monthly', day_of_month: 15, send_hour: 8, timezone: 'America/Guyana' }, from);
    expect(next.toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run lib/intel/schedule-utils.test.ts`
Expected: file not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/intel/schedule-utils.ts
//
// Pure scheduling math. Guyana is fixed UTC-4 (no DST). For other zones we
// would need Intl.DateTimeFormat; this build assumes the timezone column
// always holds 'America/Guyana'.

const GUYANA_OFFSET_HOURS = -4;

export type Frequency = 'weekly' | 'fortnightly' | 'monthly';

export type ScheduleSpec = {
  frequency: Frequency;
  day_of_week?: number | null;     // 0–6, required when frequency='weekly' or 'fortnightly'
  day_of_month?: number | null;    // 1–28, required when frequency='monthly'
  send_hour: number;               // 0–23, local
  timezone: string;                // 'America/Guyana'
};

function offsetForTimezone(tz: string): number {
  if (tz === 'America/Guyana') return GUYANA_OFFSET_HOURS;
  // Future: use Intl.DateTimeFormat for arbitrary zones.
  return GUYANA_OFFSET_HOURS;
}

// Builds a UTC Date for `year-month-day at send_hour local time`.
function utcForLocalDate(year: number, month0: number, day: number, sendHour: number, tz: string): Date {
  const offset = offsetForTimezone(tz);
  return new Date(Date.UTC(year, month0, day, sendHour - offset, 0, 0, 0));
}

function localComponents(d: Date, tz: string): { year: number; month0: number; day: number; dow: number } {
  const offset = offsetForTimezone(tz);
  const shifted = new Date(d.getTime() + offset * 3600 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dow: shifted.getUTCDay(),
  };
}

export function computeNextRunAt(spec: ScheduleSpec, from: Date = new Date()): Date {
  if (spec.frequency === 'weekly' || spec.frequency === 'fortnightly') {
    if (spec.day_of_week == null) {
      throw new Error('day_of_week required for weekly or fortnightly schedules');
    }
    const local = localComponents(from, spec.timezone);
    let target = utcForLocalDate(local.year, local.month0, local.day, spec.send_hour, spec.timezone);
    let daysAhead = (spec.day_of_week - local.dow + 7) % 7;
    if (daysAhead === 0 && target.getTime() <= from.getTime()) daysAhead = 7;
    if (daysAhead > 0) {
      target = new Date(target.getTime() + daysAhead * 86400 * 1000);
    }
    if (spec.frequency === 'fortnightly') {
      const sinceFrom = target.getTime() - from.getTime();
      const oneWeekMs = 7 * 86400 * 1000;
      if (sinceFrom < oneWeekMs) {
        target = new Date(target.getTime() + oneWeekMs);
      }
    }
    return target;
  }
  if (spec.frequency === 'monthly') {
    if (spec.day_of_month == null) {
      throw new Error('day_of_month required for monthly schedules');
    }
    const local = localComponents(from, spec.timezone);
    let target = utcForLocalDate(local.year, local.month0, spec.day_of_month, spec.send_hour, spec.timezone);
    if (target.getTime() <= from.getTime()) {
      target = utcForLocalDate(local.year, local.month0 + 1, spec.day_of_month, spec.send_hour, spec.timezone);
    }
    return target;
  }
  throw new Error(`Unknown frequency: ${spec.frequency}`);
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run lib/intel/schedule-utils.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/intel/schedule-utils.ts lib/intel/schedule-utils.test.ts
git commit -m "feat(intel-report): add schedule-utils with TDD-covered frequency math"
```

---

### Task 13: Cron handler for scheduled sends

**Files:**
- Create: `app/api/cron/agency-scheduled-reports/route.ts`

The handler picks up rows where `active = true AND next_run_at <= now()`, sends each through `prepareReport` + email, advances `next_run_at`. Reassignment is resolved at runtime: if `created_by_user_id IS NULL`, attribute the audit to the active DG (Task 5 helper).

- [ ] **Step 1: Write the route**

```typescript
// app/api/cron/agency-scheduled-reports/route.ts
//
// Vercel cron handler. Picks up due scheduled reports, sends each, and
// advances next_run_at. Reassigns audit attribution to the active DG when
// the schedule's creator has been deactivated.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { prepareReport, type ReportTemplate } from '@/lib/intel/prepare-report';
import { resolveActiveDG } from '@/lib/intel/resolve-active-dg';
import { computeNextRunAt, type Frequency } from '@/lib/intel/schedule-utils';

export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret;
}

type Row = {
  id: string;
  created_by_user_id: string | null;
  agency: string;
  recipients: string[];
  cover_message: string | null;
  frequency: Frequency;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour: number;
  timezone: string;
  template: ReportTemplate;
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('agency_scheduled_reports')
    .select('id, created_by_user_id, agency, recipients, cover_message, frequency, day_of_week, day_of_month, send_hour, timezone, template')
    .eq('active', true)
    .lte('next_run_at', nowIso)
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  let sent = 0;
  let failed = 0;
  const errors: { id: string; message: string }[] = [];

  for (const row of rows) {
    try {
      const prepared = await prepareReport({
        agency: row.agency,
        template: row.template,
        coverMessage: row.cover_message,
      });

      let attributedUserId = row.created_by_user_id;
      if (!attributedUserId) {
        const dg = await resolveActiveDG();
        attributedUserId = dg.userId;
      }

      await sendEmail({
        to: row.recipients,
        subject: prepared.subject,
        html: prepared.emailHtml,
        text: prepared.emailText,
        attachments: [{ filename: prepared.filename, content: prepared.pdfBuffer, contentType: 'application/pdf' }],
      });

      await supabaseAdmin.from('agency_intel_reports').insert({
        agency: row.agency,
        sent_by_user_id: attributedUserId,
        recipients: row.recipients,
        source: 'scheduled',
        template: row.template,
      });

      const next = computeNextRunAt({
        frequency: row.frequency,
        day_of_week: row.day_of_week,
        day_of_month: row.day_of_month,
        send_hour: row.send_hour,
        timezone: row.timezone,
      });

      await supabaseAdmin
        .from('agency_scheduled_reports')
        .update({
          last_run_at: nowIso,
          last_error: null,
          last_error_at: null,
          next_run_at: next.toISOString(),
        })
        .eq('id', row.id);

      sent += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from('agency_scheduled_reports')
        .update({ last_error: message, last_error_at: nowIso })
        .eq('id', row.id);
      failed += 1;
      errors.push({ id: row.id, message });
    }
  }

  return NextResponse.json({ ok: true, considered: rows.length, sent, failed, errors });
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/agency-scheduled-reports/route.ts
git commit -m "feat(intel-report): add Vercel cron handler for scheduled sends"
```

---

### Task 14: vercel.json cron entry

**Files:**
- Modify: `vercel.json`

Pick a once-an-hour schedule so any user-configured `send_hour` is honoured within an hour. Top of the hour is fine.

- [ ] **Step 1: Read vercel.json**

Read `/Users/alfonsodearmas/dg-work-os/vercel.json` and locate the `crons` array. Investigation cited `:10–55`.

- [ ] **Step 2: Append one entry**

Add to the existing `crons` array:

```json
{ "path": "/api/cron/agency-scheduled-reports", "schedule": "0 * * * *" }
```

The trailing comma rules of JSON apply. Place this entry following the same formatting as adjacent entries.

- [ ] **Step 3: Validate JSON**

Run: `npx -y jsonlint -q vercel.json` (or `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`)
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "feat(intel-report): wire scheduled-reports cron into vercel.json"
```

---

### Task 15: Schedules CRUD API

**Files:**
- Create: `app/api/intel/[agency]/schedules/route.ts`
- Create: `app/api/intel/[agency]/schedules/[id]/route.ts`

Standard list/create/update/delete with the same auth gate as the report routes. Create uses `computeNextRunAt` to seed `next_run_at`.

- [ ] **Step 1: Write the list/create route**

```typescript
// app/api/intel/[agency]/schedules/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { computeNextRunAt, type Frequency } from '@/lib/intel/schedule-utils';

export const runtime = 'nodejs';

type CreateBody = {
  recipients: string[];
  cover_message?: string | null;
  frequency: Frequency;
  day_of_week?: number | null;
  day_of_month?: number | null;
  send_hour?: number;
  template?: 'plain' | 'editorial';
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ agency: string }> }) {
  const { agency } = await ctx.params;
  const session = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (!canAccessAgency(session.user.role, session.user.agency, agency.toUpperCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from('agency_scheduled_reports')
    .select('*')
    .eq('agency', agency.toUpperCase())
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedules: data ?? [] });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ agency: string }> }) {
  const { agency } = await ctx.params;
  const session = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (!canAccessAgency(session.user.role, session.user.agency, agency.toUpperCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as CreateBody;
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return NextResponse.json({ error: 'recipients_required' }, { status: 400 });
  }
  if (!['weekly', 'fortnightly', 'monthly'].includes(body.frequency)) {
    return NextResponse.json({ error: 'frequency_required' }, { status: 400 });
  }
  const sendHour = typeof body.send_hour === 'number' ? body.send_hour : 8;
  const timezone = 'America/Guyana';
  const nextRunAt = computeNextRunAt({
    frequency: body.frequency,
    day_of_week: body.day_of_week ?? null,
    day_of_month: body.day_of_month ?? null,
    send_hour: sendHour,
    timezone,
  });

  const { data, error } = await supabaseAdmin
    .from('agency_scheduled_reports')
    .insert({
      created_by_user_id: session.user.id,
      agency: agency.toUpperCase(),
      recipients: body.recipients,
      cover_message: body.cover_message ?? null,
      frequency: body.frequency,
      day_of_week: body.day_of_week ?? null,
      day_of_month: body.day_of_month ?? null,
      send_hour: sendHour,
      timezone,
      template: body.template ?? 'plain',
      next_run_at: nextRunAt.toISOString(),
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}
```

- [ ] **Step 2: Write the update/delete route**

```typescript
// app/api/intel/[agency]/schedules/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { computeNextRunAt, type Frequency } from '@/lib/intel/schedule-utils';

export const runtime = 'nodejs';

type PatchBody = Partial<{
  active: boolean;
  recipients: string[];
  cover_message: string | null;
  frequency: Frequency;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour: number;
  template: 'plain' | 'editorial';
}>;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ agency: string; id: string }> }) {
  const { agency, id } = await ctx.params;
  const session = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (!canAccessAgency(session.user.role, session.user.agency, agency.toUpperCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as PatchBody;

  const update: Record<string, unknown> = {};
  if (typeof body.active === 'boolean') update.active = body.active;
  if (Array.isArray(body.recipients)) update.recipients = body.recipients;
  if ('cover_message' in body) update.cover_message = body.cover_message ?? null;
  if (body.frequency) update.frequency = body.frequency;
  if ('day_of_week' in body) update.day_of_week = body.day_of_week ?? null;
  if ('day_of_month' in body) update.day_of_month = body.day_of_month ?? null;
  if (typeof body.send_hour === 'number') update.send_hour = body.send_hour;
  if (body.template) update.template = body.template;

  // If frequency or timing changed, recompute next_run_at.
  const recomputeKeys = ['frequency', 'day_of_week', 'day_of_month', 'send_hour'];
  if (recomputeKeys.some((k) => k in update)) {
    const { data: current } = await supabaseAdmin
      .from('agency_scheduled_reports')
      .select('frequency, day_of_week, day_of_month, send_hour, timezone')
      .eq('id', id)
      .single();
    if (current) {
      const next = computeNextRunAt({
        frequency: (update.frequency as Frequency) ?? current.frequency,
        day_of_week: (update.day_of_week as number | null | undefined) ?? current.day_of_week,
        day_of_month: (update.day_of_month as number | null | undefined) ?? current.day_of_month,
        send_hour: (update.send_hour as number | undefined) ?? current.send_hour,
        timezone: current.timezone,
      });
      update.next_run_at = next.toISOString();
    }
  }

  const { data, error } = await supabaseAdmin
    .from('agency_scheduled_reports')
    .update(update)
    .eq('id', id)
    .eq('agency', agency.toUpperCase())
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ agency: string; id: string }> }) {
  const { agency, id } = await ctx.params;
  const session = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (!canAccessAgency(session.user.role, session.user.agency, agency.toUpperCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { error } = await supabaseAdmin
    .from('agency_scheduled_reports')
    .delete()
    .eq('id', id)
    .eq('agency', agency.toUpperCase());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/intel/[agency]/schedules/route.ts app/api/intel/[agency]/schedules/[id]/route.ts
git commit -m "feat(intel-report): add schedules CRUD API"
```

---

## Phase E — UI for scheduling

### Task 16: Real ScheduleList on the report page

**Files:**
- Modify: `app/intel/[agency]/report/ScheduleList.tsx`

Replace the stub with a client component that fetches `GET /api/intel/[agency]/schedules` on mount and renders rows with pause/resume/edit/delete actions.

- [ ] **Step 1: Write the component**

```tsx
// app/intel/[agency]/report/ScheduleList.tsx
'use client';

import { useEffect, useState } from 'react';

type Schedule = {
  id: string;
  agency: string;
  recipients: string[];
  frequency: 'weekly' | 'fortnightly' | 'monthly';
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour: number;
  timezone: string;
  active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  cover_message: string | null;
};

function describe(s: Schedule): string {
  if (s.frequency === 'weekly' || s.frequency === 'fortnightly') {
    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dow = s.day_of_week == null ? '' : dows[s.day_of_week];
    const word = s.frequency === 'weekly' ? 'Every' : 'Every other';
    return `${word} ${dow} at ${String(s.send_hour).padStart(2, '0')}:00`;
  }
  return `Monthly on day ${s.day_of_month} at ${String(s.send_hour).padStart(2, '0')}:00`;
}

export function ScheduleList({ agency }: { agency: string }) {
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const r = await fetch(`/api/intel/${agency}/schedules`, { cache: 'no-store' });
    const j = await r.json();
    setItems(j.schedules ?? []);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, [agency]);

  async function toggle(s: Schedule) {
    await fetch(`/api/intel/${agency}/schedules/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !s.active }),
    });
    await refresh();
  }

  async function remove(s: Schedule) {
    if (!confirm('Delete this schedule?')) return;
    await fetch(`/api/intel/${agency}/schedules/${s.id}`, { method: 'DELETE' });
    await refresh();
  }

  if (loading) return null;
  if (items.length === 0) {
    return (
      <div className="card-premium p-4">
        <div className="text-sm text-[var(--navy-600)]">No scheduled reports yet.</div>
      </div>
    );
  }

  return (
    <div className="card-premium p-4">
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Scheduled Reports</h3>
      <ul className="divide-y divide-[var(--navy-800)]">
        {items.map((s) => (
          <li key={s.id} className="py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm text-white">{describe(s)}</div>
              <div className="text-xs text-[var(--navy-600)] mt-1">
                To: {s.recipients.join(', ')}
              </div>
              <div className="text-xs text-[var(--navy-600)] mt-0.5">
                Next: {new Date(s.next_run_at).toLocaleString('en-GY')}
                {s.last_run_at ? `  ·  Last: ${new Date(s.last_run_at).toLocaleString('en-GY')}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-navy text-xs" onClick={() => toggle(s)}>
                {s.active ? 'Pause' : 'Resume'}
              </button>
              <button className="btn-navy text-xs" onClick={() => remove(s)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Edit support is intentionally deferred to the modal, per ruling 3 ("The modal creates; the page manages"). The modal opens in edit mode by passing `scheduleId` (Task 17).

- [ ] **Step 2: Manual verification**

Open `/intel/gpl/report` after Task 17 lets you create a schedule. Expected: list renders, pause toggles active, delete removes.

- [ ] **Step 3: Commit**

```bash
git add app/intel/[agency]/report/ScheduleList.tsx
git commit -m "feat(intel-report): wire ScheduleList to schedules API"
```

---

### Task 17: Modal toggle for one-off vs schedule

**Files:**
- Modify: `components/intel/GenerateReportModal.tsx`

Add `mode: 'once' | 'schedule'`, frequency/day/hour fields when mode is `'schedule'`, and on submit POST to either the existing one-off endpoint or the new schedules endpoint. Also accept a `scheduleId` prop for edit mode that loads an existing row and PATCHes on save.

- [ ] **Step 1: Read the modal**

Read `components/intel/GenerateReportModal.tsx` end to end. Note the existing state shape, recipient input pattern, message field, submit handler, and error handling.

- [ ] **Step 2: Add the mode + schedule fields**

Surgical changes:

1. Add state: `const [mode, setMode] = useState<'once' | 'schedule'>('once');`
2. Add state: `const [frequency, setFrequency] = useState<'weekly' | 'fortnightly' | 'monthly'>('weekly');`
3. Add state: `const [dayOfWeek, setDayOfWeek] = useState<number>(1);`
4. Add state: `const [dayOfMonth, setDayOfMonth] = useState<number>(1);`
5. Add state: `const [sendHour, setSendHour] = useState<number>(8);`

3. Add a toggle inside the modal header, above the recipients field:

```tsx
<div className="flex gap-2 mb-4">
  <button
    type="button"
    className={mode === 'once' ? 'btn-gold' : 'btn-navy'}
    onClick={() => setMode('once')}
  >
    Send now
  </button>
  <button
    type="button"
    className={mode === 'schedule' ? 'btn-gold' : 'btn-navy'}
    onClick={() => setMode('schedule')}
  >
    Schedule
  </button>
</div>
```

4. When `mode === 'schedule'`, render below the message field:

```tsx
<div className="grid grid-cols-2 gap-3">
  <label className="block">
    <span className="text-xs text-[var(--navy-600)] uppercase tracking-wide">Frequency</span>
    <select
      className="w-full mt-1 bg-[var(--navy-900)] border border-[var(--navy-800)] rounded px-2 py-1 text-sm text-white"
      value={frequency}
      onChange={(e) => setFrequency(e.target.value as 'weekly' | 'fortnightly' | 'monthly')}
    >
      <option value="weekly">Weekly</option>
      <option value="fortnightly">Fortnightly</option>
      <option value="monthly">Monthly</option>
    </select>
  </label>
  {(frequency === 'weekly' || frequency === 'fortnightly') && (
    <label className="block">
      <span className="text-xs text-[var(--navy-600)] uppercase tracking-wide">Day of week</span>
      <select
        className="w-full mt-1 bg-[var(--navy-900)] border border-[var(--navy-800)] rounded px-2 py-1 text-sm text-white"
        value={dayOfWeek}
        onChange={(e) => setDayOfWeek(Number(e.target.value))}
      >
        {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
          <option key={i} value={i}>{d}</option>
        ))}
      </select>
    </label>
  )}
  {frequency === 'monthly' && (
    <label className="block">
      <span className="text-xs text-[var(--navy-600)] uppercase tracking-wide">Day of month</span>
      <input
        type="number" min={1} max={28} value={dayOfMonth}
        onChange={(e) => setDayOfMonth(Number(e.target.value))}
        className="w-full mt-1 bg-[var(--navy-900)] border border-[var(--navy-800)] rounded px-2 py-1 text-sm text-white"
      />
    </label>
  )}
  <label className="block">
    <span className="text-xs text-[var(--navy-600)] uppercase tracking-wide">Send hour (local)</span>
    <input
      type="number" min={0} max={23} value={sendHour}
      onChange={(e) => setSendHour(Number(e.target.value))}
      className="w-full mt-1 bg-[var(--navy-900)] border border-[var(--navy-800)] rounded px-2 py-1 text-sm text-white"
    />
  </label>
</div>
```

5. Change the submit handler so it branches on `mode`:

```tsx
async function handleSubmit() {
  setSubmitting(true);
  try {
    if (mode === 'once') {
      const r = await fetch(`/api/intel/${agency}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, message }),
      });
      if (!r.ok) throw new Error(await r.text());
      onClose();
    } else {
      const body = {
        recipients,
        cover_message: message,
        frequency,
        day_of_week: (frequency === 'weekly' || frequency === 'fortnightly') ? dayOfWeek : null,
        day_of_month: frequency === 'monthly' ? dayOfMonth : null,
        send_hour: sendHour,
      };
      const url = scheduleId
        ? `/api/intel/${agency}/schedules/${scheduleId}`
        : `/api/intel/${agency}/schedules`;
      const r = await fetch(url, {
        method: scheduleId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      onClose();
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : 'send failed');
  } finally {
    setSubmitting(false);
  }
}
```

6. If `scheduleId` is passed, fetch the existing row on mount and hydrate `recipients`, `message`, `frequency`, `dayOfWeek`, `dayOfMonth`, `sendHour`, and force `mode='schedule'`.

7. The Modal's existing prop interface gets one new optional prop: `scheduleId?: string`. The ScheduleList in Task 16 passes this when "Edit" is clicked (add an Edit button to ScheduleList that opens the modal in edit mode).

- [ ] **Step 3: Add an Edit affordance to ScheduleList**

Wire an "Edit" button alongside Pause and Delete. It opens the same modal with `scheduleId={s.id}`. The simplest implementation: lift modal state into a parent that owns both the ScheduleList and the modal mount. The existing button that opens the modal lives in `components/intel/GenerateReportButton.tsx` (verify). If a clean lift is awkward, render a separate modal mount inside ScheduleList itself.

- [ ] **Step 4: Manual verification**

Sign in. Open the modal on `/intel/gpl`, toggle to Schedule, choose Weekly / Wednesday / 08:00, set recipients to a test address, submit. Expected: 200, schedule appears in the list on `/intel/gpl/report`. Pause it. Resume it. Edit it. Delete it. Each action 200.

Then manually invoke the cron handler with `curl`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/agency-scheduled-reports
```

(Set `next_run_at` to a past timestamp first via Supabase Studio.) Expected: the test email arrives, `last_run_at` advances, `next_run_at` advances by frequency, an `agency_intel_reports` row with `source = 'scheduled'` is inserted.

- [ ] **Step 5: Commit**

```bash
git add components/intel/GenerateReportModal.tsx components/intel/GenerateReportButton.tsx app/intel/[agency]/report/ScheduleList.tsx
git commit -m "feat(intel-report): add schedule mode to modal and Edit action to list"
```

---

## Phase F — Verification and cleanup

### Task 18: End-to-end smoke matrix

This is not a code task. Execute every path and verify behaviour.

- [ ] **Step 1: One-off plain (default)**

POST from the modal with `mode='once'`. Verify the email arrives with a plain PDF attachment. No 84pt gold numerals. No italic "Chapter i". No volume/issue line.

- [ ] **Step 2: One-off editorial (flag)**

Manually call `POST /api/intel/gpl/report?template=editorial` with the same body. Verify the editorial Intel Brief renders unchanged.

- [ ] **Step 3: Legacy template gone**

`POST /api/intel/gpl/report?template=legacy`. Expected: behaves as default plain (the `legacy` query is ignored).

- [ ] **Step 4: GET HTML**

Navigate to `/intel/gpl/report`. Verify the white-paper view renders, header/stats/sections look identical in field layout to the PDF.

- [ ] **Step 5: GET PDF**

Click Download PDF. Verify the same plain PDF downloads as in Step 1.

- [ ] **Step 6: Field-vs-record discipline (MARAD)**

Navigate to `/intel/marad/report` (or whichever agency has tenders without `days_in_stage`). Verify:
- Procurement section renders.
- Every tender appears.
- Tenders without `days_in_stage` show stage label only, no day-count badge, no "not tracked" string, no em-dash.
- Lede counts unnamed owners by placeholder string, not by null.

- [ ] **Step 7: Field-vs-record discipline (projects)**

Find a delayed project with no `contractors` value. Verify:
- Title still renders.
- No "Contractor unspecified" string appears.
- No contractor line at all.

- [ ] **Step 8: Authz**

Sign in as an agency_admin for GPL. Try `/intel/gwi/report` and `/api/intel/gwi/report.pdf`. Expected: blocked.

- [ ] **Step 9: Rate limit semantics**

Send 10 one-off reports as the same user within an hour. Eleventh: 429. Confirm a scheduled-source row inserted by the cron handler does not contribute to that count by inspecting the rate-limit query (`source = 'manual'`).

- [ ] **Step 10: DG reassignment**

Pick a test schedule, set `created_by_user_id = NULL` in Supabase. Trigger cron. Verify `agency_intel_reports.sent_by_user_id` for that send equals the active DG's id (Task 5 helper).

- [ ] **Step 11: Commit nothing, but note any followups**

If anything failed, fix in a small follow-up commit before proceeding to the next phase.

---

### Task 19: /simplify, push, deploy

- [ ] **Step 1: Run /simplify on the diff**

Invoke the project's `/simplify` skill against the current branch.

- [ ] **Step 2: Apply any accepted simplifications**

- [ ] **Step 3: Push**

```bash
git push -u origin <branch-name>
```

- [ ] **Step 4: Manually run migration 125 against the Supabase project**

The user runs `supabase/migrations/125_agency_scheduled_reports.sql` against the project. Confirm with them this is done before deploying the cron handler, otherwise the handler will 500 on its first run.

- [ ] **Step 5: Deploy via the project's standard path**

Open PR, merge to main, watch Vercel deploy. Verify the cron entry appears in the Vercel dashboard under Crons.

---

## Migration list (manual execution only)

| # | File | Purpose |
|---|---|---|
| 125 | `supabase/migrations/125_agency_scheduled_reports.sql` | `agency_intel_reports.source` + `template` columns; new `agency_scheduled_reports` table + RLS + indexes + `updated_at` trigger. |

No other migrations are needed.

---

## Self-review notes

**Spec coverage:** Each of the six Phase 2 deliverables maps to tasks: (1) plain renderer → Tasks 1, 3; HTML view → Task 4; tokens → Task 1; editorial flag preserved in Tasks 6, 7; legacy delete → Task 8. (2) Missing-data treatment → Task 2 helpers and Tasks 3, 4 wiring; field-vs-record discipline encoded in `isPresentOwner`, `computeLedeStats`, `stageLabel`. (3) Direct access → Tasks 9, 10 (page + PDF endpoint); auth reused from `lib/auth-helpers.ts`. (4) Scheduling → Tasks 11–17 (migration, utils, cron, vercel.json, CRUD, list, modal toggle); DG reassignment at runtime in Task 13. (5) Shared send path → Task 6 (`prepareReport`) consumed by Tasks 7, 9, 10, 13. (6) Migration list → above.

**Placeholder scan:** No "TBD", no "appropriate error handling", no "similar to Task N". Each task carries the actual code or the specific edit instruction.

**Type consistency:** `Frequency`, `ScheduleSpec`, `PreparedReport`, `IntelReportProps` are defined once and reused. `computeNextRunAt` returns `Date`; consumers use `.toISOString()` for DB storage.

**Known risk surfaces:**
- `getAgencyIntelData` field names (`open_tasks`, `delayed_projects`, `critical_procurement`, `is_overdue`, `contract_value`, etc.) are assumed from the investigation. If actual field names differ, adjust the renderer and view in Tasks 3, 4 verbatim.
- The auth helper `requireRole` is assumed to return a session with `user.id`, `user.role`, `user.agency`. Verify against `lib/auth-helpers.ts` before Task 7.
- `sendEmail` signature (`to`, `subject`, `html`, `text`, `attachments`) is assumed from current route usage. Verify against `lib/email.ts`.
- `supabaseAdmin` is the existing project export.

Adjust the imports/signatures as needed when the assumed shape diverges from the real one. The plan's intent stands; the names align to whatever the project actually uses.
