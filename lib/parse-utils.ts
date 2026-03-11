/**
 * Shared parsing utilities for AI responses, search input, pagination, and Excel dates.
 */

/**
 * Parse AI-generated JSON with fallbacks: direct parse → markdown block → brace extraction.
 * Throws if all approaches fail.
 */
export function parseAIJson<T>(raw: string): T {
  // Try direct parse
  try {
    return JSON.parse(raw);
  } catch { /* fall through */ }

  // Try extracting from markdown code block
  const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch { /* fall through */ }
  }

  // Try finding JSON object boundaries
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch { /* fall through */ }
  }

  throw new Error('Failed to parse AI JSON response');
}

/**
 * Sanitize search input by stripping PostgREST filter special characters.
 * Prevents injection in `.ilike` / `.or` queries.
 */
export function sanitizeSearchInput(input: string): string {
  return input.replace(/[%_.*(),"\\]/g, '');
}

/**
 * Parse pagination parameters from URL search params.
 * Returns Supabase-compatible `from` and `to` range values.
 */
export function parsePaginationParams(
  params: URLSearchParams,
  defaultPageSize = 50,
  maxPageSize = 200
): { from: number; to: number; page: number; pageSize: number } {
  const page = Math.max(1, parseInt(params.get('page') || '1', 10));
  const pageSize = Math.min(
    Math.max(1, parseInt(params.get('pageSize') || params.get('limit') || String(defaultPageSize), 10)),
    maxPageSize
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to, page, pageSize };
}

/**
 * Parse an Excel date value (serial number, Date object, or string) into an ISO date string.
 * Returns null if the value cannot be parsed.
 */
export function parseExcelDate(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString().split('T')[0];
  }

  // Excel serial number (days since 1899-12-30)
  if (typeof value === 'number' && value > 1 && value < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().split('T')[0];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    // ISO format: 2026-01-24
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    // US format: M/D/YYYY
    const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
    }

    // Fallback: native Date parser
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }

  return null;
}
