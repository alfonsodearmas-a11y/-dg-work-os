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
  // Fireflies splits long utterances into multiple sentence rows; the validator
  // builds the transcript text as `[ts] speaker: text` joined by newlines.
  // A quote that spans two sentences from the same speaker (one continuous
  // utterance to a human listener) must still match.
  it('matches a multi-sentence single-speaker quote across Fireflies splits', () => {
    const transcript = [
      '[1015.58] Alfonso De Armas: Would you be open to having a call like this one with your counterpart or with the person at the airport,',
      '[1018.20] Alfonso De Armas: at this airport who are responsible for this?',
    ].join('\n');
    const quote = 'Would you be open to having a call like this one with your counterpart or with the person at the airport, at this airport who are responsible for this?';
    expect(quoteAppearsInTranscript(quote, transcript)).toBe(true);
  });
  it('strips [<seconds>] timestamp brackets but keeps prose colons', () => {
    const transcript = '[42.5] Speaker 1: He said: "Yes, I will."';
    expect(quoteAppearsInTranscript('He said: "Yes, I will."', transcript)).toBe(true);
  });
  it('handles non-breaking space (NBSP) in transcript', () => {
    const transcript = 'I will approve the contract.';
    expect(quoteAppearsInTranscript('I will approve the contract.', transcript)).toBe(true);
  });
  it('handles NFD-decomposed unicode in either side', () => {
    // 'café' as NFD: 'cafe' + U+0301 (combining acute) → must match NFC 'café'.
    const transcript = 'Reserve a table at café by Friday.';
    expect(quoteAppearsInTranscript('Reserve a table at café by Friday.', transcript)).toBe(true);
  });
});
