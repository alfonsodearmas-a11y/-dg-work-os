// Direct Outreach — region derivation from outreach_location.
//
// The OP Direct workbook has no dedicated region column (the `region` column on
// direct_outreach_cases exists but is never populated — the importer looks for a
// "Region" header the workbook doesn't carry). The administrative region is
// instead embedded as free text in `outreach_location`, in two shapes that refer
// to the same region:
//   numeric   — "Region 6", "Region 10", "Region 3: Hyronie Market Tarmac"
//   spelled   — "Region Three: Cabinet Outreach", "Region Six: Berbice - VP"
// Many rows carry only a place name ("Bartica - Cabinet Outreach") and have no
// region at all.
//
// This module is the single source of truth for turning that free text into a
// canonical "Region N" label. `extractOutreachRegion` (+ `distinctRegions`)
// builds the filter dropdown's options; `outreachRegionSql` produces the SQL
// predicate the list query filters on. Both are driven by WORD_TO_NUM, so the
// dropdown and the filter can never name a region the other side can't match.

/** Spelled-out region → its number. Guyana has exactly 10 administrative regions. */
const WORD_TO_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// Numeric form: "region 10" / "region 3". `10|[1-9]` (10 first) + a trailing word
// boundary so "Region 15" doesn't degrade to "Region 1".
const NUMERIC_RE = /\bregion\s+(10|[1-9])\b/i;
// Spelled form: "region three". Alternation is ordered longest-safe; \b closes it.
const WORD_RE = new RegExp(`\\bregion\\s+(${Object.keys(WORD_TO_NUM).join('|')})\\b`, 'i');

/**
 * Canonical "Region N" for a free-text outreach_location, or null when the text
 * names no region. Numeric and spelled forms collapse to the same label.
 */
export function extractOutreachRegion(location: string | null | undefined): string | null {
  if (!location) return null;
  const numeric = location.match(NUMERIC_RE);
  if (numeric) return `Region ${numeric[1]}`;
  const word = location.match(WORD_RE);
  if (word) return `Region ${WORD_TO_NUM[word[1].toLowerCase()]}`;
  return null;
}

/** Region number for ordering; non-canonical strings sort last. */
function regionNumber(region: string): number {
  const m = region.match(/\bregion\s+(\d+)\b/i);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

/**
 * Distinct, naturally-ordered regions (Region 2 before Region 10, not lexical).
 */
export function sortRegions(regions: Iterable<string>): string[] {
  return [...new Set(regions)].sort(
    (a, b) => regionNumber(a) - regionNumber(b) || a.localeCompare(b),
  );
}

/**
 * The dropdown option source: distinct non-null regions present in a set of
 * outreach_location values, naturally sorted. Empty when no row names a region.
 */
export function distinctRegions(locations: Iterable<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const location of locations) {
    const region = extractOutreachRegion(location);
    if (region) found.add(region);
  }
  return sortRegions(found);
}

/**
 * Postgres expression mapping a text column to canonical "Region N" (or NULL),
 * mirroring extractOutreachRegion for use in the list-filter WHERE clause. `col`
 * is a caller-fixed column reference (e.g. 'v.outreach_location'), never user
 * input. `\y` is a Postgres word boundary; `[[:space:]]` its \s equivalent.
 */
export function outreachRegionSql(col: string): string {
  const numeric = `regexp_match(${col}, 'region[[:space:]]+(10|[1-9])\\y', 'i')`;
  const wordBranches = Object.entries(WORD_TO_NUM)
    .map(([word, num]) => `    WHEN ${col} ~* 'region[[:space:]]+${word}\\y' THEN 'Region ${num}'`)
    .join('\n');
  return `CASE
    WHEN (${numeric})[1] IS NOT NULL THEN 'Region ' || (${numeric})[1]
${wordBranches}
    ELSE NULL
  END`;
}
