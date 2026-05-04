import { describe, it, expect } from 'vitest';
import { normalizeForQuoteCompare } from '@/lib/action-items/validation/normalize';
import { quoteAppearsInTranscript } from '@/lib/action-items/validation/quote-substring';

describe('normalizeForQuoteCompare', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeForQuoteCompare('  Hello   World  ')).toBe('hello world');
  });
  it('strips [inaudible] / [crosstalk] / [applause]', () => {
    expect(normalizeForQuoteCompare('I will [inaudible] do it'))
      .toBe('i will do it');
    expect(normalizeForQuoteCompare('Sure [crosstalk] yes')).toBe('sure yes');
  });
  it('normalizes smart quotes and dashes', () => {
    expect(normalizeForQuoteCompare('“Yes,” he said—then left.'))
      .toBe('"yes," he said-then left.');
  });
});

describe('quoteAppearsInTranscript', () => {
  it('matches after normalization', () => {
    const transcript = '00:01:00 Speaker 1: I will [inaudible] approve the contract by Friday.';
    expect(quoteAppearsInTranscript('I will approve the contract by Friday.', transcript)).toBe(true);
  });
  it('rejects fabricated quote', () => {
    const transcript = '00:01:00 Speaker 1: Hello there.';
    expect(quoteAppearsInTranscript('I will approve the contract.', transcript)).toBe(false);
  });
  it('matches with smart-quote difference', () => {
    const transcript = 'He said "the answer is yes."';
    expect(quoteAppearsInTranscript('He said “the answer is yes.”', transcript)).toBe(true);
  });
});
