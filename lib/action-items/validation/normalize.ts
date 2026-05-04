const STRIP_TOKENS = /\[(inaudible|crosstalk|applause|laughter|silence)\]/gi;

export function normalizeForQuoteCompare(s: string): string {
  return s
    .replace(STRIP_TOKENS, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
