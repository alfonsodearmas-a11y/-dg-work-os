import { describe, it, expect, vi } from 'vitest';
import type { LogEventInput } from '@/lib/action-items/events';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db-admin', () => {
  const insert = vi.fn(async () => ({ error: null }));
  return { supabaseAdmin: { from: () => ({ insert }) }, __mocks: { insert } };
});

describe('logEvent', () => {
  it('inserts a row with task_id (not item_id)', async () => {
    const { logEvent } = await import('@/lib/action-items/events');
    const dbMod = await import('@/lib/db-admin') as unknown as { __mocks: { insert: ReturnType<typeof vi.fn> } };

    const input: LogEventInput = {
      taskId: 't-1', eventType: 'status_change',
      actorId: 'u-dg', payload: { from: 'new', to: 'awaiting_verification' },
    };
    await logEvent(input);

    expect(dbMod.__mocks.insert).toHaveBeenCalledWith({
      task_id: 't-1',
      event_type: 'status_change',
      actor_id: 'u-dg',
      payload: { from: 'new', to: 'awaiting_verification' },
    });
  });
});
