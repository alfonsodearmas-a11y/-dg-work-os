import { describe, it, expect } from 'vitest';
import { containsEmDash, rejectEmDash, stripEmDash, EmDashError } from '@/lib/referrals/em-dash-guard';

describe('em-dash guard', () => {
  it('detects U+2014 em dash', () => {
    expect(containsEmDash('foo — bar')).toBe(true);
  });

  it('does not flag hyphens or en-dashes', () => {
    expect(containsEmDash('foo - bar')).toBe(false);
    expect(containsEmDash('foo – bar')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(containsEmDash(null)).toBe(false);
    expect(containsEmDash(undefined)).toBe(false);
  });

  it('rejectEmDash throws EmDashError with a useful message', () => {
    expect(() => rejectEmDash('a — b', 'recommendation')).toThrowError(EmDashError);
    expect(() => rejectEmDash('a — b', 'recommendation')).toThrowError(
      /recommendation may not contain em-dashes/,
    );
  });

  it('rejectEmDash is a no-op for clean strings or null', () => {
    expect(() => rejectEmDash('clean', 'x')).not.toThrow();
    expect(() => rejectEmDash(null, 'x')).not.toThrow();
  });

  it('stripEmDash replaces em-dashes with ", " and collapses double spaces', () => {
    expect(stripEmDash('a — b — c')).toBe('a, b, c');
    expect(stripEmDash('clean')).toBe('clean');
    expect(stripEmDash('a—b')).toBe('a, b');
  });
});
