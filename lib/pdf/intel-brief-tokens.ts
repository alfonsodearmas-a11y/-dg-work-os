/**
 * The Intel Brief — editorial palette and typography tokens.
 *
 * Kept as plain JS objects so they can be passed to react-pdf's
 * `StyleSheet.create` without a bundler step. The values here are the
 * canonical source for the editorial template; do not duplicate them in the
 * render module.
 */

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const INK = '#f1ecdd'; // primary cream, body + headlines
export const BG = '#1a2740'; // page ground
export const BG_DEEP = '#14202f'; // dark fill behind seal/badge inserts
export const MUTED = '#8b9bb7'; // secondary metadata
export const MUTED_2 = '#5e6e8b'; // tertiary, dimmest labels
export const GOLD = '#e5b73d'; // oversized numerals, eyebrows, accents
export const ORANGE = '#fb923c'; // overdue/severity accents only
export const RULE = 'rgba(241,236,221,0.15)'; // hairline dividers

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * react-pdf registers fonts under a single family name with weight + style
 * variants. The render module calls `Font.register` four times against
 * 'Inter' with weights 300, 400 (normal + italic), and 700.
 */
export const FONT_FAMILY = 'Inter';

/**
 * Type scale.
 *
 * Sizes are pt (react-pdf's default unit on a Page); the spec was authored
 * in px for the on-screen reference. 1pt approximates 1.33px at 96dpi but
 * react-pdf renders to a paginated PDF where pt is the native unit, so we
 * keep the pt values from the spec verbatim. Visual proofs at A4/Letter
 * have confirmed the editorial scale reads correctly.
 */
export const TYPE = {
  masthead: {
    fontFamily: FONT_FAMILY,
    fontSize: 72,
    fontWeight: 300,
    letterSpacing: -2.52,
    lineHeight: 1.0,
    color: INK,
  },
  chapterHeading: {
    fontFamily: FONT_FAMILY,
    fontSize: 36,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    letterSpacing: -0.72,
    lineHeight: 1.15,
    color: INK,
  },
  oversizedNumeral: {
    fontFamily: FONT_FAMILY,
    fontSize: 84,
    fontWeight: 300,
    letterSpacing: -4.2,
    lineHeight: 0.85,
    color: GOLD,
    // Inter ships tabular numerals in the default character set; no extra
    // OpenType feature setting is required for tnum at this weight.
  },
  volumeIssue: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: 400,
    letterSpacing: 0.66,
    textTransform: 'uppercase' as const,
    color: MUTED,
  },
  eyebrow: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: 400,
    letterSpacing: 2.42,
    textTransform: 'uppercase' as const,
    color: GOLD,
  },
  chapterMarker: {
    // Tiny "CHAPTER" word above the Roman numeral.
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: 400,
    letterSpacing: 2.42,
    textTransform: 'uppercase' as const,
    color: GOLD,
  },
  body: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.5,
    color: INK,
  },
  bodyItalic: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    lineHeight: 1.5,
    color: INK,
  },
  // Recipient lede sits a notch larger than article body for editorial weight.
  lede: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    lineHeight: 1.5,
    color: INK,
  },
  articleTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: 400,
    color: INK,
    lineHeight: 1.4,
  },
  meta: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: 400,
    color: MUTED,
    lineHeight: 1.4,
  },
  metaOverdue: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: 400,
    color: ORANGE,
  },
  metaUnassigned: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    color: ORANGE,
  },
  ownerInitials: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.48,
    textTransform: 'uppercase' as const,
    color: BG_DEEP,
  },
  statCaption: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: 400,
    color: MUTED,
    lineHeight: 1.4,
    marginTop: 4,
  },
  footer: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: 400,
    color: MUTED_2,
    letterSpacing: 0.4,
  },
  // Coda block at the end of Chapter iii — "Also in evaluation."
  codaHeader: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    color: MUTED,
    marginTop: 16,
    marginBottom: 8,
  },
  codaItem: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: 400,
    color: MUTED,
    lineHeight: 1.5,
  },
} as const;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Single-column editorial. The spec calls for 820px column at desktop;
 * inside an A4 page (595x842pt) the column simplifies to a centered block
 * with generous side margins.
 */
export const PAGE = {
  // A4 default — caller can override via Page size prop.
  paddingHorizontal: 56,
  paddingTop: 56,
  paddingBottom: 64,
  backgroundColor: BG,
};

export const SPACE = {
  // Vertical rhythm between major blocks.
  mastheadToStats: 48,
  statsToFirstChapter: 64,
  chapterInternalLede: 12,
  chapterToFirstArticle: 24,
  betweenArticles: 0, // hairline divider provides the separation visually
  articleVerticalPadding: 14,
};

export const SEAL = {
  // 28x28 cream square with two-letter initials, no border-radius.
  size: 28,
  background: INK,
};

export const RULE_HEIGHT = 0.5; // hairline width
