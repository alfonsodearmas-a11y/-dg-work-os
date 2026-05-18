import type { PoolClient } from 'pg';

export function guyanaYearOf(d: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guyana', year: 'numeric' }).format(d),
  );
}

export function formatNptabReferenceNumber(seq: number, year: number): string {
  return `MPUA-NPTAB-${year}-${seq.toString().padStart(4, '0')}`;
}

export async function allocateNptabReferenceNumber(
  now: Date = new Date(),
  client?: PoolClient,
): Promise<string> {
  const sql = "SELECT nextval('nptab_report_ref_seq') AS seq";
  let result;
  if (client) {
    result = await client.query(sql);
  } else {
    const { query } = await import('@/lib/db-pg');
    result = await query(sql);
  }
  const seq = Number(result.rows[0].seq);
  return formatNptabReferenceNumber(seq, guyanaYearOf(now));
}
