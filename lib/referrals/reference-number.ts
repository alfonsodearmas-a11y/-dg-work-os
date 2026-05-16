import type { PoolClient } from 'pg';

/**
 * Returns the calendar year in Guyana local time (America/Guyana, UTC-4, no DST).
 * Using Intl avoids hardcoding the offset and remains correct if Guyana ever
 * adopts DST in the future (it currently does not).
 */
export function guyanaYearOf(d: Date): number {
  const yearStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guyana',
    year: 'numeric',
  }).format(d);
  return Number(yearStr);
}

export function formatReferenceNumber(seq: number, year: number): string {
  const padded = seq.toString().padStart(4, '0');
  return `MPUA-MR-${year}-${padded}`;
}

/**
 * Allocates the next sequence value atomically. The year stamped on the
 * reference number is the Guyana local year at allocation time. Can be called
 * either with a transaction-scoped client (preferred during submission) or
 * via the shared pool.
 */
export async function allocateReferenceNumber(
  now: Date = new Date(),
  client?: PoolClient,
): Promise<string> {
  const sql = "SELECT nextval('referral_ref_seq') AS seq";
  let result;
  if (client) {
    result = await client.query(sql);
  } else {
    const { query } = await import('@/lib/db-pg');
    result = await query(sql);
  }
  const seq = Number(result.rows[0].seq);
  return formatReferenceNumber(seq, guyanaYearOf(now));
}
