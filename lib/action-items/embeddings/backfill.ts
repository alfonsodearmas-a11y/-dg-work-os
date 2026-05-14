import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import { embedText } from './openai';
import { logger } from '@/lib/logger';

export async function embedTask(taskId: string): Promise<void> {
  const { data: task } = await supabaseAdmin
    .from('tasks').select('id, title, source').eq('id', taskId).maybeSingle();
  if (!task || task.source !== 'extraction') return;
  try {
    const vec = await embedText(task.title as string);
    await supabaseAdmin.from('tasks').update({ task_embedding: vec }).eq('id', taskId);
  } catch (err) {
    logger.warn({ err, taskId }, 'embedTask failed (non-fatal)');
  }
}
