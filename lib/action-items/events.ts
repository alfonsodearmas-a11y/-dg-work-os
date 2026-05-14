import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import type { EventType } from './constants';
import { logger } from '@/lib/logger';

export interface LogEventInput {
  taskId: string;
  eventType: EventType;
  actorId: string | null;
  payload: Record<string, unknown>;
}

export async function logEvent(input: LogEventInput): Promise<void> {
  const { error } = await supabaseAdmin.from('action_item_events').insert({
    task_id: input.taskId,
    event_type: input.eventType,
    actor_id: input.actorId,
    payload: input.payload,
  });
  if (error) {
    logger.error({ err: error, taskId: input.taskId, eventType: input.eventType },
      'action_item_events insert failed');
  }
}
