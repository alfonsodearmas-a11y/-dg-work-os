import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';

/**
 * Snapshot all existing delayed projects before an upload.
 * Creates one row per project in delayed_project_snapshots with today's date.
 * Uses UPSERT on (project_id, snapshot_date) so same-day re-uploads update
 * rather than duplicate.
 */
export async function snapshotBeforeUpload(): Promise<{ snapshotted: number; date: string }> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: projects, error } = await supabaseAdmin
    .from('delayed_projects')
    .select('id, completion_percent, contract_value, project_end_date, status')
    .eq('status', 'DELAYED');

  if (error) {
    logger.error({ error }, 'Failed to fetch projects for snapshot');
    return { snapshotted: 0, date: today };
  }

  if (!projects || projects.length === 0) {
    return { snapshotted: 0, date: today };
  }

  const snapshots = projects.map((p) => ({
    project_id: p.id as string,
    snapshot_date: today,
    completion_percent: p.completion_percent,
    contract_value: p.contract_value,
    project_end_date: p.project_end_date,
    status: p.status,
  }));

  // Batch upsert in chunks of 50
  let snapshotted = 0;
  for (let i = 0; i < snapshots.length; i += 50) {
    const chunk = snapshots.slice(i, i + 50);
    const { error: upsertError } = await supabaseAdmin
      .from('delayed_project_snapshots')
      .upsert(chunk, { onConflict: 'project_id,snapshot_date' });

    if (upsertError) {
      logger.error({ error: upsertError, chunk: i }, 'Snapshot upsert chunk failed');
    } else {
      snapshotted += chunk.length;
    }
  }

  logger.info({ snapshotted, date: today }, 'Pre-upload snapshots created');
  return { snapshotted, date: today };
}
