import { normalizeForQuoteCompare } from './normalize';

export function quoteAppearsInTranscript(quote: string, transcript: string): boolean {
  const nq = normalizeForQuoteCompare(quote);
  const nt = normalizeForQuoteCompare(transcript);
  const ok = nq.length > 0 && nt.includes(nq);
  // Targeted debug for extraction 99049fe3 item 3 (call-with-counterpart quote).
  // Remove once the specific Fireflies edge case is identified and patched.
  if (!ok && nq.startsWith('would you be open')) {
    const probe = 'would you be open';
    const idx = nt.indexOf(probe);
    const slice = idx >= 0
      ? nt.slice(Math.max(0, idx - 20), idx + 200)
      : '(probe not found)';
    console.log('[quote-debug] nq=%s', JSON.stringify(nq));
    console.log('[quote-debug] indexOf(nq)=%d', nt.indexOf(nq));
    console.log('[quote-debug] indexOf(probe)=%d', idx);
    console.log('[quote-debug] nt slice=%s', JSON.stringify(slice));
  }
  return ok;
}
