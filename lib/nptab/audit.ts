import type { PoolClient } from 'pg';

export interface NptabAuditEntryInput {
  report_id: string;
  changed_by: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
}

export async function writeNptabAuditEntriesTx(
  client: PoolClient,
  entries: NptabAuditEntryInput[],
): Promise<void> {
  if (entries.length === 0) return;
  const placeholders: string[] = [];
  const values: unknown[] = [];
  entries.forEach((e, i) => {
    const base = i * 5;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    values.push(e.report_id, e.changed_by, e.field_changed, e.old_value, e.new_value);
  });
  await client.query(
    `INSERT INTO nptab_report_audit_log (report_id, changed_by, field_changed, old_value, new_value)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
}
