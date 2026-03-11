import { describe, it, expect } from 'vitest';
import {
  parseAIJson,
  sanitizeSearchInput,
  parsePaginationParams,
  parseExcelDate,
} from '@/lib/parse-utils';

describe('parseAIJson', () => {
  it('parses valid JSON directly', () => {
    expect(parseAIJson<{ name: string }>('{"name":"test"}')).toEqual({ name: 'test' });
  });

  it('parses a JSON array', () => {
    expect(parseAIJson<number[]>('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parses nested objects', () => {
    const input = JSON.stringify({ level1: { level2: 'deep' }, arr: [1, 2] });
    expect(parseAIJson<Record<string, unknown>>(input)).toEqual({
      level1: { level2: 'deep' },
      arr: [1, 2],
    });
  });

  it('extracts JSON from markdown code fences with json tag', () => {
    expect(parseAIJson('```json\n{"status":"ok"}\n```')).toEqual({ status: 'ok' });
  });

  it('extracts JSON from markdown code fences without language tag', () => {
    expect(parseAIJson('```\n{"status":"ok"}\n```')).toEqual({ status: 'ok' });
  });

  it('extracts JSON surrounded by prose', () => {
    const input = 'Here is the result:\n```json\n{"score":95}\n```\nDone.';
    expect(parseAIJson(input)).toEqual({ score: 95 });
  });

  it('extracts JSON by brace boundaries when no fences', () => {
    expect(parseAIJson('Result: {"key":"value"} end.')).toEqual({ key: 'value' });
  });

  it('throws on empty string', () => {
    expect(() => parseAIJson('')).toThrow('Failed to parse AI JSON response');
  });

  it('throws on completely malformed input', () => {
    expect(() => parseAIJson('not json')).toThrow('Failed to parse AI JSON response');
  });

  it('throws on incomplete JSON', () => {
    expect(() => parseAIJson('{"key": "value"')).toThrow('Failed to parse AI JSON response');
  });

  it('parses JSON with whitespace', () => {
    expect(parseAIJson('  \n  {"spaced": true}  ')).toEqual({ spaced: true });
  });

  it('handles special characters in strings', () => {
    const input = '{"msg":"line1\\nline2","path":"C:\\\\dir"}';
    expect(parseAIJson<{ msg: string; path: string }>(input)).toEqual({
      msg: 'line1\nline2',
      path: 'C:\\dir',
    });
  });
});

describe('sanitizeSearchInput', () => {
  it('returns normal strings unchanged', () => {
    expect(sanitizeSearchInput('hello world')).toBe('hello world');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeSearchInput('')).toBe('');
  });

  it('strips SQL wildcards', () => {
    expect(sanitizeSearchInput('%admin%')).toBe('admin');
    expect(sanitizeSearchInput('test_value')).toBe('testvalue');
  });

  it('strips PostgREST filter characters', () => {
    expect(sanitizeSearchInput('value.*pattern')).toBe('valuepattern');
    expect(sanitizeSearchInput('a(b)c')).toBe('abc');
    expect(sanitizeSearchInput('field,"value"')).toBe('fieldvalue');
  });

  it('strips backslashes', () => {
    expect(sanitizeSearchInput('path\\to\\thing')).toBe('pathtothing');
  });

  it('preserves safe characters', () => {
    expect(sanitizeSearchInput('my-search term 123')).toBe('my-search term 123');
  });

  it('handles strings of only special characters', () => {
    expect(sanitizeSearchInput('%_.*(),"\\')).toBe('');
  });

  it('preserves unicode', () => {
    expect(sanitizeSearchInput('café')).toBe('café');
  });
});

describe('parsePaginationParams', () => {
  function makeParams(obj: Record<string, string>): URLSearchParams {
    return new URLSearchParams(obj);
  }

  it('returns defaults when no params', () => {
    expect(parsePaginationParams(makeParams({}))).toEqual({
      from: 0, to: 49, page: 1, pageSize: 50,
    });
  });

  it('parses valid page and pageSize', () => {
    expect(parsePaginationParams(makeParams({ page: '3', pageSize: '20' }))).toEqual({
      from: 40, to: 59, page: 3, pageSize: 20,
    });
  });

  it('accepts limit as alias for pageSize', () => {
    expect(parsePaginationParams(makeParams({ page: '2', limit: '10' }))).toEqual({
      from: 10, to: 19, page: 2, pageSize: 10,
    });
  });

  it('clamps page to minimum of 1', () => {
    const result = parsePaginationParams(makeParams({ page: '-5' }));
    expect(result.page).toBe(1);
    expect(result.from).toBe(0);
  });

  it('clamps page 0 to 1', () => {
    expect(parsePaginationParams(makeParams({ page: '0' })).page).toBe(1);
  });

  it('clamps pageSize to minimum of 1', () => {
    expect(parsePaginationParams(makeParams({ pageSize: '-10' })).pageSize).toBe(1);
  });

  it('clamps pageSize to maxPageSize', () => {
    expect(parsePaginationParams(makeParams({ pageSize: '999' })).pageSize).toBe(200);
  });

  it('respects custom defaultPageSize', () => {
    expect(parsePaginationParams(makeParams({}), 25).pageSize).toBe(25);
  });

  it('respects custom maxPageSize', () => {
    expect(parsePaginationParams(makeParams({ pageSize: '500' }), 50, 100).pageSize).toBe(100);
  });

  it('handles non-numeric strings (NaN falls through Math.max)', () => {
    const result = parsePaginationParams(makeParams({ page: 'abc', pageSize: 'xyz' }));
    // parseInt('abc') = NaN, Math.max(1, NaN) = NaN — this is the actual behavior
    expect(result.page).toBeNaN();
    expect(result.pageSize).toBeNaN();
  });

  it('computes correct range for large page numbers', () => {
    const result = parsePaginationParams(makeParams({ page: '100', pageSize: '50' }));
    expect(result.from).toBe(4950);
    expect(result.to).toBe(4999);
  });

  it('handles pageSize of 1', () => {
    expect(parsePaginationParams(makeParams({ page: '5', pageSize: '1' }))).toEqual({
      from: 4, to: 4, page: 5, pageSize: 1,
    });
  });
});

describe('parseExcelDate', () => {
  it('returns null for null', () => {
    expect(parseExcelDate(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseExcelDate(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseExcelDate('')).toBeNull();
  });

  it('returns null for zero', () => {
    expect(parseExcelDate(0)).toBeNull();
  });

  it('parses Excel serial date 44927 as 2023-01-01', () => {
    expect(parseExcelDate(44927)).toBe('2023-01-01');
  });

  it('parses Excel serial date 2 as 1900-01-01', () => {
    expect(parseExcelDate(2)).toBe('1900-01-01');
  });

  it('returns null for serial number >= 100000', () => {
    expect(parseExcelDate(100000)).toBeNull();
  });

  it('returns null for serial number <= 1', () => {
    expect(parseExcelDate(1)).toBeNull();
  });

  it('parses a Date object', () => {
    expect(parseExcelDate(new Date('2026-03-11T00:00:00Z'))).toBe('2026-03-11');
  });

  it('returns null for invalid Date', () => {
    expect(parseExcelDate(new Date('invalid'))).toBeNull();
  });

  it('parses ISO date string', () => {
    expect(parseExcelDate('2026-01-24')).toBe('2026-01-24');
  });

  it('parses US format M/D/YYYY', () => {
    expect(parseExcelDate('1/24/2026')).toBe('2026-01-24');
  });

  it('parses US format with leading zeros', () => {
    expect(parseExcelDate('01/05/2026')).toBe('2026-01-05');
  });

  it('parses via native fallback', () => {
    expect(parseExcelDate('March 11, 2026')).toBe('2026-03-11');
  });

  it('returns null for non-date string', () => {
    expect(parseExcelDate('not a date')).toBeNull();
  });

  it('returns null for boolean', () => {
    expect(parseExcelDate(true as unknown)).toBeNull();
  });

  it('handles whitespace', () => {
    expect(parseExcelDate('  2026-01-24  ')).toBe('2026-01-24');
  });
});
