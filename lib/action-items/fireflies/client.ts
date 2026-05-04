import 'server-only';
import {
  FirefliesTranscriptMetaZ, FirefliesTranscriptFullZ,
  type FirefliesTranscriptMeta, type FirefliesTranscriptFull,
} from './types';
import { logger } from '@/lib/logger';

const FIREFLIES_GRAPHQL = 'https://api.fireflies.ai/graphql';
const RETRY_DELAYS_MS = [1000, 4000, 16000];

export class FirefliesError extends Error {
  status?: number;
  constructor(msg: string, status?: number) { super(msg); this.status = status; }
}

async function firefliesFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) throw new FirefliesError('FIREFLIES_API_KEY not set');

  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(FIREFLIES_GRAPHQL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status >= 500) throw new FirefliesError(`Fireflies ${res.status}`, res.status);
      const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors?.length) throw new FirefliesError(`Fireflies GraphQL: ${json.errors.map(e => e.message).join('; ')}`);
      if (!json.data) throw new FirefliesError('Fireflies returned no data');
      return json.data;
    } catch (err) {
      lastErr = err;
      const transient = err instanceof FirefliesError && (err.status === undefined || err.status >= 500);
      if (!transient || attempt === RETRY_DELAYS_MS.length) break;
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  logger.error({ err: lastErr }, 'Fireflies fetch failed after retries');
  throw lastErr instanceof Error ? lastErr : new FirefliesError(String(lastErr));
}

const LIST_QUERY = `
  query ListTranscripts($fromDate: DateTime, $limit: Int) {
    transcripts(fromDate: $fromDate, limit: $limit) {
      id title date duration transcript_url meeting_link
      organizer_email source transcript_status
      meeting_attendees { email name displayName }
    }
  }
`;

const GET_QUERY = `
  query GetTranscript($id: String!) {
    transcript(id: $id) {
      id title date duration transcript_url meeting_link
      organizer_email source transcript_status
      meeting_attendees { email name displayName }
      sentences { speaker_name text start_time end_time }
    }
  }
`;

export async function listRecentTranscripts(since: Date, limit = 50): Promise<FirefliesTranscriptMeta[]> {
  const data = await firefliesFetch<{ transcripts: unknown[] }>(LIST_QUERY, {
    fromDate: since.toISOString(), limit,
  });
  const out: FirefliesTranscriptMeta[] = [];
  for (const raw of data.transcripts ?? []) {
    const parsed = FirefliesTranscriptMetaZ.safeParse(raw);
    if (parsed.success) {
      const t = parsed.data;
      if ((!t.attendees || t.attendees.length === 0) && t.meeting_attendees) {
        t.attendees = t.meeting_attendees;
      }
      out.push(t);
    } else {
      logger.warn({ err: parsed.error.flatten(), raw }, 'Fireflies transcript meta failed schema');
    }
  }
  return out;
}

export async function getTranscript(meetingId: string): Promise<FirefliesTranscriptFull | null> {
  const data = await firefliesFetch<{ transcript: unknown }>(GET_QUERY, { id: meetingId });
  if (!data.transcript) return null;
  const parsed = FirefliesTranscriptFullZ.safeParse(data.transcript);
  if (!parsed.success) {
    logger.warn({ err: parsed.error.flatten() }, 'Fireflies transcript full failed schema');
    return null;
  }
  return parsed.data;
}
