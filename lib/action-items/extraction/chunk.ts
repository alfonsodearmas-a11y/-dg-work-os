// Naive token estimate: 4 chars ≈ 1 token. If transcript exceeds 60k tokens,
// split into 30-min windows with 5-min overlap.
import type { FirefliesTranscriptFull } from '@/lib/action-items/fireflies/types';

const TOKEN_ESTIMATE_DIVISOR = 4;
const MAX_TOKENS = 60_000;
const WINDOW_SEC = 30 * 60;
const OVERLAP_SEC = 5 * 60;

export interface TranscriptChunk {
  index: number;
  start_sec: number;
  end_sec: number;
  text: string;
}

export function chunkTranscriptIfNeeded(t: FirefliesTranscriptFull): TranscriptChunk[] {
  const fullText = (t.sentences ?? [])
    .map(s => `[${s.start_time ?? '?'}] ${s.speaker_name ?? '?'}: ${s.text}`)
    .join('\n');
  const estTokens = Math.ceil(fullText.length / TOKEN_ESTIMATE_DIVISOR);
  if (estTokens <= MAX_TOKENS) {
    return [{ index: 0, start_sec: 0, end_sec: Number.POSITIVE_INFINITY, text: fullText }];
  }
  const lastSec = (t.sentences ?? []).reduce((m, s) => Math.max(m, s.end_time ?? s.start_time ?? 0), 0);
  const chunks: TranscriptChunk[] = [];
  let i = 0;
  for (let start = 0; start < lastSec; start += WINDOW_SEC - OVERLAP_SEC) {
    const end = Math.min(start + WINDOW_SEC, lastSec);
    const text = (t.sentences ?? [])
      .filter(s => (s.start_time ?? 0) >= start && (s.start_time ?? 0) < end)
      .map(s => `[${s.start_time ?? '?'}] ${s.speaker_name ?? '?'}: ${s.text}`)
      .join('\n');
    chunks.push({ index: i++, start_sec: start, end_sec: end, text });
    if (end >= lastSec) break;
  }
  return chunks;
}
