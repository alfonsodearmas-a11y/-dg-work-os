import { normalizeForQuoteCompare } from './normalize';

export function quoteAppearsInTranscript(quote: string, transcript: string): boolean {
  const nq = normalizeForQuoteCompare(quote);
  const nt = normalizeForQuoteCompare(transcript);
  return nq.length > 0 && nt.includes(nq);
}
