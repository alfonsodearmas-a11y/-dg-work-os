/* eslint-disable react/no-unknown-property */
// @react-pdf/renderer uses element names that React types don't recognize
// (Document, Page, Text, View, StyleSheet). Disable the rule file-wide.

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
import type { AgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { computeIssue, formatIssueLine } from './intel-brief-issue';
import * as T from './intel-brief-tokens';

// ---------------------------------------------------------------------------
// Font registration. Runs once per cold start. Inter TTFs are bundled in
// public/fonts/ so there is no network at render time.
// ---------------------------------------------------------------------------

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');

Font.register({
  family: T.FONT_FAMILY,
  fonts: [
    { src: path.join(FONT_DIR, 'Inter-Light.ttf'), fontWeight: 300 },
    { src: path.join(FONT_DIR, 'Inter-Regular.ttf'), fontWeight: 400 },
    {
      src: path.join(FONT_DIR, 'Inter-Italic.ttf'),
      fontWeight: 400,
      fontStyle: 'italic',
    },
    { src: path.join(FONT_DIR, 'Inter-Bold.ttf'), fontWeight: 700 },
  ],
});

// react-pdf hyphenates aggressively by default; that is wrong for headlines
// and editorial body copy. Disable.
Font.registerHyphenationCallback((word) => [word]);

// ---------------------------------------------------------------------------
// Stylesheet — derived directly from tokens.
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    backgroundColor: T.BG,
    paddingHorizontal: T.PAGE.paddingHorizontal,
    paddingTop: T.PAGE.paddingTop,
    paddingBottom: T.PAGE.paddingBottom,
    fontFamily: T.FONT_FAMILY,
    color: T.INK,
  },

  // Masthead block
  wordmarkLine1: {
    ...T.TYPE.eyebrow,
    color: T.MUTED,
    letterSpacing: 1.2,
  },
  wordmarkLine2: {
    ...T.TYPE.eyebrow,
    color: T.MUTED_2,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  volumeIssue: { ...T.TYPE.volumeIssue, marginTop: 24 },
  eyebrow: { ...T.TYPE.eyebrow, marginTop: 18 },
  masthead: { ...T.TYPE.masthead, marginTop: 16 },
  lede: { ...T.TYPE.lede, marginTop: 24, maxWidth: 460 },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    marginTop: T.SPACE.mastheadToStats,
  },
  statCol: {
    flex: 1,
    paddingRight: 24,
  },
  statNumeral: { ...T.TYPE.oversizedNumeral },
  statCaption: { ...T.TYPE.statCaption },
  statNumeralMuted: {
    ...T.TYPE.oversizedNumeral,
    color: T.MUTED, // used by the "Quiet week" page
  },

  // Chapter
  chapterWrap: {
    marginTop: T.SPACE.statsToFirstChapter,
  },
  chapterMarker: { ...T.TYPE.chapterMarker, marginBottom: 4 },
  chapterRoman: {
    ...T.TYPE.oversizedNumeral,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  chapterHeadline: { ...T.TYPE.chapterHeading },
  chapterLede: { ...T.TYPE.bodyItalic, marginTop: T.SPACE.chapterInternalLede, color: T.MUTED },
  chapterBody: { marginTop: T.SPACE.chapterToFirstArticle },

  // Article rows
  articleRow: {
    flexDirection: 'row',
    paddingVertical: T.SPACE.articleVerticalPadding,
    borderBottomWidth: T.RULE_HEIGHT,
    borderBottomColor: T.RULE,
  },
  articleRowFirst: {
    flexDirection: 'row',
    paddingVertical: T.SPACE.articleVerticalPadding,
    borderTopWidth: T.RULE_HEIGHT,
    borderTopColor: T.RULE,
    borderBottomWidth: T.RULE_HEIGHT,
    borderBottomColor: T.RULE,
  },
  articleSeal: {
    width: T.SEAL.size,
    height: T.SEAL.size,
    backgroundColor: T.SEAL.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  articleSealText: { ...T.TYPE.ownerInitials },
  articleBody: { flex: 1 },
  articleTitle: { ...T.TYPE.articleTitle },
  articleMeta: { ...T.TYPE.meta, marginTop: 4 },
  articleMetaOverdue: { ...T.TYPE.metaOverdue, marginTop: 4 },
  articleMetaUnassigned: { ...T.TYPE.metaUnassigned },

  // Project / procurement top-line stat (gold tnum row above the title)
  topStatRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  topStatNumber: {
    fontFamily: T.FONT_FAMILY,
    fontSize: 22,
    fontWeight: 300,
    color: T.GOLD,
    letterSpacing: -0.6,
    marginRight: 6,
  },
  topStatLabel: {
    fontFamily: T.FONT_FAMILY,
    fontSize: 11,
    fontWeight: 400,
    color: T.MUTED,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginRight: 16,
  },

  // Coda
  codaHeader: { ...T.TYPE.codaHeader },
  codaItem: { ...T.TYPE.codaItem, marginTop: 6 },
  codaItemNumber: {
    fontFamily: T.FONT_FAMILY,
    fontSize: 12,
    fontWeight: 300,
    color: T.GOLD,
  },

  // Empty / quiet week
  quietBody: {
    ...T.TYPE.bodyItalic,
    marginTop: 64,
    color: T.MUTED,
    fontSize: 16,
  },

  // Footer
  footer: {
    position: 'absolute',
    left: T.PAGE.paddingHorizontal,
    right: T.PAGE.paddingHorizontal,
    bottom: 32,
    borderTopWidth: T.RULE_HEIGHT,
    borderTopColor: T.RULE,
    paddingTop: 12,
    ...T.TYPE.footer,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIDDLE_DOT = '·';

const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

function initialsFromName(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name
    .replace(/[()].*$/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PLACEHOLDER_OWNER_PATTERN = /placeholder|\bTBD\b|\bunassigned\b|^—$/i;

function isPlaceholderOwner(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return PLACEHOLDER_OWNER_PATTERN.test(trimmed);
}

function formatGYD(value: number | null | undefined): string | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `GYD ${n.toLocaleString()}`;
}

function colloquialDate(date: Date): string {
  return date.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const STAGE_LABELS: Record<string, string> = {
  design: 'Design',
  advertised: 'Advertised',
  evaluation: 'Evaluation',
  awaiting_award: 'Awaiting Award',
  award: 'Award',
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function Wordmark() {
  // Editorial wordmark, two-line. We don't ship a vector seal; the typographic
  // mark and the masthead carry identity.
  return (
    <View>
      <Text style={styles.wordmarkLine1}>DG WORK OS</Text>
      <Text style={styles.wordmarkLine2}>
        OFFICE OF THE DIRECTOR GENERAL {MIDDLE_DOT} MINISTRY OF PUBLIC UTILITIES &amp; AVIATION
      </Text>
    </View>
  );
}

interface MastheadProps {
  agencyDisplay: string;
  recipientName: string;
  generatedAt: Date;
}

function Masthead({ agencyDisplay, recipientName, generatedAt }: MastheadProps) {
  const issue = computeIssue(generatedAt);
  return (
    <View wrap={false}>
      <Wordmark />
      <Text style={styles.volumeIssue}>{formatIssueLine(issue)}</Text>
      <Text style={styles.eyebrow}>— The Intel Brief —</Text>
      <Text style={styles.masthead}>{agencyDisplay}.</Text>
      <Text style={styles.lede}>
        Open work, delayed projects, and procurement attention,{' '}
        surfaced from DG Work OS for {recipientName}.
      </Text>
    </View>
  );
}

interface StatsStripProps {
  openTasks: number;
  delayedProjects: number;
  criticalProcurement: number;
  muted?: boolean;
}

function StatsStrip({ openTasks, delayedProjects, criticalProcurement, muted }: StatsStripProps) {
  const numeralStyle = muted ? styles.statNumeralMuted : styles.statNumeral;
  return (
    <View style={styles.statsStrip} wrap={false}>
      <View style={styles.statCol}>
        <Text style={numeralStyle}>{openTasks}</Text>
        <Text style={styles.statCaption}>open tasks</Text>
      </View>
      <View style={styles.statCol}>
        <Text style={numeralStyle}>{delayedProjects}</Text>
        <Text style={styles.statCaption}>delayed projects</Text>
      </View>
      <View style={styles.statCol}>
        <Text style={numeralStyle}>{criticalProcurement}</Text>
        <Text style={styles.statCaption}>procurements stalled</Text>
      </View>
    </View>
  );
}

interface ChapterProps {
  ordinal: number;
  headline: string;
  lede: string;
  isFirst?: boolean;
  children: React.ReactNode;
}

function Chapter({ ordinal, headline, lede, isFirst, children }: ChapterProps) {
  return (
    <View style={styles.chapterWrap} break={!isFirst}>
      <Text style={styles.chapterMarker}>CHAPTER</Text>
      <Text style={styles.chapterRoman}>{ROMAN[ordinal] ?? String(ordinal)}</Text>
      <Text style={styles.chapterHeadline}>{headline}</Text>
      <Text style={styles.chapterLede}>{lede}</Text>
      <View style={styles.chapterBody}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chapter i — Open Tasks
// ---------------------------------------------------------------------------

function OpenTasksChapter({ data, isFirst }: { data: AgencyIntelData; isFirst: boolean }) {
  const tasks = [...data.open_tasks].sort((a, b) => {
    if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
  const overdue = tasks.filter((t) => t.is_overdue).length;

  const lede =
    tasks.length === 0
      ? 'No open work this week.'
      : overdue > 0
        ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} open. ${overdue} past due.`
        : `${tasks.length} task${tasks.length === 1 ? '' : 's'} open. None overdue.`;

  return (
    <Chapter ordinal={1} headline="Open work." lede={lede} isFirst={isFirst}>
      {tasks.slice(0, 30).map((t, idx) => (
        <View key={t.id} style={idx === 0 ? styles.articleRowFirst : styles.articleRow} wrap={false}>
          <View style={styles.articleSeal}>
            <Text style={styles.articleSealText}>{initialsFromName(t.owner_name)}</Text>
          </View>
          <View style={styles.articleBody}>
            <Text style={styles.articleTitle}>{t.title}</Text>
            <Text style={t.is_overdue ? styles.articleMetaOverdue : styles.articleMeta}>
              {t.status.toUpperCase()}
              {t.owner_name ? ` ${MIDDLE_DOT} ${t.owner_name}` : ''}
              {t.due_date
                ? ` ${MIDDLE_DOT} due ${t.due_date}${t.is_overdue ? '. overdue.' : ''}`
                : ` ${MIDDLE_DOT} no due date`}
            </Text>
          </View>
        </View>
      ))}
    </Chapter>
  );
}

// ---------------------------------------------------------------------------
// Chapter ii — Delayed Projects
// ---------------------------------------------------------------------------

function DelayedProjectsChapter({
  data,
  isFirst,
}: {
  data: AgencyIntelData;
  isFirst: boolean;
}) {
  const projects = [...data.delayed_projects]
    .sort((a, b) => (b.days_overdue ?? -1) - (a.days_overdue ?? -1))
    .slice(0, 25);

  const totalSlip = projects.reduce(
    (s, p) => s + Math.max(0, p.days_overdue ?? 0),
    0,
  );
  const lede =
    projects.length === 0
      ? 'No projects late.'
      : `${projects.length} project${projects.length === 1 ? '' : 's'} behind schedule. ${totalSlip} days of cumulative slip.`;

  return (
    <Chapter ordinal={2} headline="Projects in slip." lede={lede} isFirst={isFirst}>
      {projects.map((p, idx) => {
        const completion =
          typeof p.completion_percent === 'number'
            ? `${Math.round(Number(p.completion_percent))}%`
            : null;
        const days =
          p.days_overdue != null && p.days_overdue > 0 ? `${p.days_overdue}` : null;
        const value = formatGYD(p.contract_value as unknown as number | null);
        return (
          <View
            key={p.id}
            style={idx === 0 ? styles.articleRowFirst : styles.articleRow}
            wrap={false}
          >
            <View style={styles.articleBody}>
              <View style={styles.topStatRow}>
                {completion ? (
                  <>
                    <Text style={styles.topStatNumber}>{completion}</Text>
                    <Text style={styles.topStatLabel}>complete</Text>
                  </>
                ) : null}
                {days ? (
                  <>
                    <Text style={styles.topStatNumber}>{days}</Text>
                    <Text style={styles.topStatLabel}>days overdue</Text>
                  </>
                ) : null}
              </View>
              <Text style={styles.articleTitle}>{p.project_name}</Text>
              <Text style={styles.articleMeta}>
                {p.contractors ? p.contractors : 'Contractor unspecified'}
                {value ? ` ${MIDDLE_DOT} ${value}` : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </Chapter>
  );
}

// ---------------------------------------------------------------------------
// Chapter iii — Critical Procurement (with Tenders coda)
// ---------------------------------------------------------------------------

const REASON_LABEL: Record<string, string> = {
  missing_pending_decision: 'Missing. Pending decision.',
  missing_from_upload: 'Missing from latest upload.',
  stale_award: 'Stale award.',
};

function ProcurementChapter({
  data,
  isFirst,
}: {
  data: AgencyIntelData;
  isFirst: boolean;
}) {
  const items = data.critical_procurement.slice(0, 25);
  const evaluation = data.evaluation_tenders.slice(0, 12);

  const unnamed = items.filter((t) => isPlaceholderOwner(t.next_action_owner)).length;
  const lede =
    items.length === 0
      ? 'No critical procurement issues this week.'
      : unnamed === items.length
        ? `${items.length} procurement${items.length === 1 ? '' : 's'} stalled. None has a named next-action owner.`
        : unnamed > 0
          ? `${items.length} procurement${items.length === 1 ? '' : 's'} stalled. ${unnamed} without a named next-action owner.`
          : `${items.length} procurement${items.length === 1 ? '' : 's'} stalled.`;

  return (
    <Chapter ordinal={3} headline="Procurement attention." lede={lede} isFirst={isFirst}>
      {items.map((t, idx) => {
        const ownerMissing = isPlaceholderOwner(t.next_action_owner);
        const stage = STAGE_LABELS[t.stage] ?? t.stage;
        return (
          <View
            key={t.id}
            style={idx === 0 ? styles.articleRowFirst : styles.articleRow}
            wrap={false}
          >
            <View style={styles.articleBody}>
              <View style={styles.topStatRow}>
                {t.days_in_stage != null ? (
                  <>
                    <Text style={styles.topStatNumber}>{t.days_in_stage}</Text>
                    <Text style={styles.topStatLabel}>days in stage</Text>
                  </>
                ) : null}
                <Text style={styles.topStatLabel}>{stage.toUpperCase()}</Text>
              </View>
              <Text style={styles.articleTitle}>{t.description}</Text>
              <Text style={styles.articleMeta}>
                {REASON_LABEL[t.reason] ?? t.reason}
                {' '}
                {MIDDLE_DOT}
                {' '}
                next:{' '}
                {ownerMissing ? (
                  <Text style={styles.articleMetaUnassigned}>unassigned</Text>
                ) : (
                  <Text>{t.next_action_owner}</Text>
                )}
              </Text>
            </View>
          </View>
        );
      })}

      {evaluation.length > 0 ? (
        <View wrap={false}>
          <Text style={styles.codaHeader}>Also in evaluation.</Text>
          {evaluation.map((e) => (
            <View key={e.id} style={styles.codaItem}>
              <Text style={styles.codaItem}>
                <Text style={styles.codaItemNumber}>{e.days_in_stage ?? '—'}d</Text>{' '}
                {MIDDLE_DOT} {e.description}
                {e.sub_programme_name ? ` ${MIDDLE_DOT} ${e.sub_programme_name}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Chapter>
  );
}

// ---------------------------------------------------------------------------
// Empty / quiet-week page
// ---------------------------------------------------------------------------

function QuietWeekBody() {
  return (
    <Text style={styles.quietBody}>
      Nothing demands the Director General's attention this week.
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function FooterText({
  agencyDisplay,
  generatedBy,
  generatedAt,
}: {
  agencyDisplay: string;
  generatedBy: string;
  generatedAt: Date;
}) {
  const colloquial = colloquialDate(generatedAt);
  return (
    <Text style={styles.footer} fixed>
      The Intel Brief {MIDDLE_DOT} {agencyDisplay} {MIDDLE_DOT} {generatedBy} {MIDDLE_DOT}{' '}
      {colloquial}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Top-level Document
// ---------------------------------------------------------------------------

export interface IntelBriefRenderParams {
  data: AgencyIntelData;
  generatedBy: string;
  /** The DG's name for the lede — addresses the brief to the Director General by definition. Falls back to `generatedBy` when no DG row exists. */
  recipientName: string;
}

function IntelBriefDocument({ data, generatedBy, recipientName }: IntelBriefRenderParams) {
  const generatedAt = new Date(data.generated_at);
  const agencyDisplay = data.agency;

  const hasOpen = data.open_tasks.length > 0;
  const hasDelayed = data.delayed_projects.length > 0;
  const hasProcurement =
    data.critical_procurement.length > 0 || data.evaluation_tenders.length > 0;

  const isQuiet = !hasOpen && !hasDelayed && !hasProcurement;

  // Render the chapters in fixed order, but the *first* rendered chapter
  // mustn't trigger `break: true` (no page-break before the first chapter).
  const chapters: Array<'open' | 'delayed' | 'procurement'> = [];
  if (hasOpen) chapters.push('open');
  if (hasDelayed) chapters.push('delayed');
  if (hasProcurement) chapters.push('procurement');

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Masthead
          agencyDisplay={agencyDisplay}
          recipientName={recipientName}
          generatedAt={generatedAt}
        />
        <StatsStrip
          openTasks={data.open_tasks.length}
          delayedProjects={data.delayed_projects.length}
          criticalProcurement={data.critical_procurement.length}
          muted={isQuiet}
        />

        {isQuiet ? <QuietWeekBody /> : null}

        {chapters.map((chapter, idx) => {
          const isFirst = idx === 0;
          if (chapter === 'open') {
            return <OpenTasksChapter key="open" data={data} isFirst={isFirst} />;
          }
          if (chapter === 'delayed') {
            return <DelayedProjectsChapter key="delayed" data={data} isFirst={isFirst} />;
          }
          return <ProcurementChapter key="procurement" data={data} isFirst={isFirst} />;
        })}

        <FooterText
          agencyDisplay={agencyDisplay}
          generatedBy={generatedBy}
          generatedAt={generatedAt}
        />
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Public API — server-only.
// ---------------------------------------------------------------------------

export async function renderIntelBriefPDF(params: IntelBriefRenderParams): Promise<Buffer> {
  const stream = await pdf(<IntelBriefDocument {...params} />).toBuffer();
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | Uint8Array) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
