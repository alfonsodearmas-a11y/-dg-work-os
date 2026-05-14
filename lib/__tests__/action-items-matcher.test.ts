import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { extractNounPhrases, scoreCombined } from '@/lib/action-items/matcher/supersession';

describe('extractNounPhrases', () => {
  it('extracts capitalized 1–3 word sequences excluding sentence-initial', () => {
    const phrases = extractNounPhrases('Issue notification of termination to InterEnergy and notify GPL Board');
    // Skipped: sentence-initial "Issue".
    expect(phrases).toContain('interenergy');
    expect(phrases).toContain('gpl board');
    expect(phrases).not.toContain('issue');
  });
  it('returns lowercased phrases for comparison', () => {
    const phrases = extractNounPhrases('Talk to InterEnergy');
    expect(phrases).toEqual(['interenergy']);
  });
});

describe('scoreCombined', () => {
  it('weights cosine 0.5, jaccard 0.3, verb match 0.2', () => {
    const r = scoreCombined({ cosine: 1, jaccard: 1, verbMatch: true });
    expect(r).toBeCloseTo(1.0);
  });
  it('verb mismatch gives 0 in that term', () => {
    const r = scoreCombined({ cosine: 1, jaccard: 0, verbMatch: false });
    expect(r).toBeCloseTo(0.5);
  });
});
