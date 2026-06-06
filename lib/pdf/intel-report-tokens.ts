// Plain shared design tokens for the Agency Intel Report.
//
// Both the PDF renderer (lib/pdf/intel-report-render.tsx) and the on-screen
// HTML view (lib/intel/intel-report-view.tsx) read these tokens so the report
// looks the same in both contexts. PDF consumes the numeric values directly;
// the HTML view formats sizes as `${n}px`.

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

// Inter weights registered in the PDF renderer: 300, 400, 700. Use only
// these values. The HTML view maps 700 to font-semibold/bold equivalents.
export const TYPE = {
  title:        { size: 24, weight: 700, lineHeight: 1.2,  letterSpacing: -0.3 },
  subtitle:     { size: 11, weight: 400, lineHeight: 1.4,  letterSpacing: 0.4 },
  sectionLabel: { size: 13, weight: 700, lineHeight: 1.2,  letterSpacing: 0.6 },
  itemTitle:    { size: 12, weight: 700, lineHeight: 1.35, letterSpacing: 0 },
  body:         { size: 11, weight: 400, lineHeight: 1.5,  letterSpacing: 0 },
  meta:         { size: 10, weight: 400, lineHeight: 1.4,  letterSpacing: 0 },
  metaEmphasis: { size: 10, weight: 700, lineHeight: 1.4,  letterSpacing: 0 },
  statNumber:   { size: 22, weight: 700, lineHeight: 1.1,  letterSpacing: 0 },
  statLabel:    { size: 10, weight: 400, lineHeight: 1.4,  letterSpacing: 0.4 },
  cellNumber:   { size: 14, weight: 700, lineHeight: 1.1,  letterSpacing: 0 },
  cellLabel:    { size: 9,  weight: 400, lineHeight: 1.4,  letterSpacing: 0.4 },
  footer:       { size: 9,  weight: 400, lineHeight: 1.4,  letterSpacing: 0 },
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

export type TypeKey = keyof typeof TYPE;
