/**
 * Server-side email validator for transactional sends (report exports, etc.).
 *
 * Strict-enough RFC 5322 subset: rejects malformed addresses, multi-@,
 * spaces, leading/trailing dots, and addresses without a TLD. Not perfect
 * (no email regex is) — paired with a try/send + log so genuine bounces
 * still surface in agency_intel_reports + email errors.
 */
const EMAIL_REGEX =
  /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export function isValidEmail(input: string): boolean {
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  // Reject consecutive dots in local part (e.g. foo..bar@x.com)
  if (trimmed.includes('..')) return false;
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Split a comma- or whitespace-separated string into normalized email
 * candidates. Useful for chip-input fields where users paste lists.
 */
export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Validate an array of email candidates. Returns { valid, invalid } so the
 * caller can surface which addresses to fix.
 */
export function validateEmailList(emails: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const e of emails) {
    const normalized = e.trim().toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (isValidEmail(normalized)) valid.push(e.trim());
    else invalid.push(e.trim());
  }
  return { valid, invalid };
}
