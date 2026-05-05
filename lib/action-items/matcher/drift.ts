import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import { findSupersessionCandidates } from './supersession';

export interface DriftFinding {
  task_id: string;
  task_title: string;
  candidates: Array<{ task_id: string; title: string; score: number }>;
}

export async function runDriftDetector(): Promise<{ inspected: number; findings: DriftFinding[] }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from('tasks')
    .select('id, title, owner_user_id, verb_category, task_embedding, supersedes_id')
    .eq('source', 'extraction')
    .gte('created_at', since)
    .is('supersedes_id', null)
    .not('task_embedding', 'is', null)
    .limit(200);
  const sample = (recent ?? []).filter((_, i) => i % 10 === 0);   // 10% sample, deterministic
  const findings: DriftFinding[] = [];
  for (const t of sample) {
    const cands = await findSupersessionCandidates({
      id: t.id as string,
      owner_user_id: t.owner_user_id as string,
      title: t.title as string,
      verb_category: t.verb_category as string | null,
      task_embedding: t.task_embedding as unknown as number[] | null,
    });
    if (cands.length > 0) {
      findings.push({
        task_id: t.id as string, task_title: t.title as string,
        candidates: cands.map(c => ({ task_id: c.task_id, title: c.title, score: c.score })),
      });
    }
  }
  return { inspected: sample.length, findings };
}
