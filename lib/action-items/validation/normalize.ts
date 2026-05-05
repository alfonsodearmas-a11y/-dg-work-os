// Quote-comparison normalizer. Used by quoteAppearsInTranscript at extraction
// validation (resolveExtractedItem) and at the submit-time fabrication gate
// in /api/action-items/review/[extractionId]. Both call sites must produce
// identical strings or the gates disagree.
//
// Order of operations matters:
//   1. NFC unicode — recombine decomposed forms before any regex match.
//   2. Non-breaking space → regular space.
//   3. Strip transcript-noise markers ([inaudible] / [crosstalk] / etc.).
//   4. Strip Fireflies-style timestamp brackets ([1015.58], [?]).
//   5. Strip line-prefixed speaker labels (`Alfonso De Armas: `).
//   6. Fold smart quotes / dashes to ASCII.
//   7. Lowercase, collapse whitespace, trim.
//
// Trade-off (intentional): steps 4 + 5 erase the boundary between
// consecutive speakers' turns, so a fabricated quote that happens to splice
// the END of speaker A's sentence with the START of speaker B's sentence
// would substring-match. We accept this because:
//   (a) v0.2 prompt instructs Claude to keep source_quote to a single
//       contiguous span from one speaker, and the political-risk gate
//       triggers mandatory review for low-confidence quotes anyway;
//   (b) the spec ranks fabrication > cross-speaker enforcement;
//   (c) without these strips the validator rejects ALL real multi-sentence
//       single-speaker quotes (Fireflies splits on commas/clauses), which
//       was the worse failure mode observed on the first smoke
//       (extraction 99049fe3-..., 2026-05-04).
// If we ever want stricter cross-speaker enforcement, the path is to inject
// a sentinel like ` ||SPEAKER|| ` only at speaker-CHANGE boundaries during
// transcript-text construction (rather than between every sentence), so a
// cross-speaker quote contains the sentinel and fails the substring match
// while a same-speaker multi-sentence quote does not.

const STRIP_TOKENS = /\[(inaudible|crosstalk|applause|laughter|silence)\]/gi;
const TIMESTAMP_BRACKET = /\[[\d.?]+\]/g;
// Line-prefixed speaker label: `Speaker Name: ` at the start of a line. Lazy
// `[^:\n]+?` stops at the first colon, so prose like "He said: hello" is not
// eaten — only the leading-of-line `Name:` is.
const LINE_SPEAKER_PREFIX = /^\s*[^:\n]+?:\s+/gm;
const NBSP = / /g;

export function normalizeForQuoteCompare(s: string): string {
  return s
    .normalize('NFC')
    .replace(NBSP, ' ')
    .replace(STRIP_TOKENS, ' ')
    .replace(TIMESTAMP_BRACKET, ' ')
    .replace(LINE_SPEAKER_PREFIX, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
