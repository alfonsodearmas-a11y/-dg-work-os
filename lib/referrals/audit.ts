import type { PoolClient } from 'pg';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface AuditEntry {
  referral_id: string;
  changed_by: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
}

/**
 * Inserts audit entries via supabaseAdmin. Throws on failure so callers can
 * decide to abort. Used outside transactions.
 */
export async function writeAuditEntries(entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const { error } = await supabaseAdmin.from('referral_audit_log').insert(entries);
  if (error) {
    logger.error({ err: error, entries }, 'referral_audit_log insert failed');
    throw new Error('Failed to write audit log entries');
  }
}

/**
 * Inserts audit entries on a transaction-scoped pg client so the writes
 * commit/roll back atomically with the parent UPDATE. Used during status
 * transitions where partial state must not be observable.
 */
export async function writeAuditEntriesTx(client: PoolClient, entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  // Single multi-row INSERT — keeps round-trips tight.
  const placeholders: string[] = [];
  const values: unknown[] = [];
  entries.forEach((e, i) => {
    const base = i * 5;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    values.push(e.referral_id, e.changed_by, e.field_changed, e.old_value, e.new_value);
  });
  await client.query(
    `INSERT INTO referral_audit_log (referral_id, changed_by, field_changed, old_value, new_value)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
}

