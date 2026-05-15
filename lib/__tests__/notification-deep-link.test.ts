import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { commentDeepLinkPath, parentDeepLinkPath } from '@/lib/notifications/deep-link';
import { entityUrl } from '@/lib/notifications/email-utils';
import { resolveNotificationUrl } from '@/components/notifications/notification-utils';
import type { Notification } from '@/lib/notifications';

const baseNotif = (over: Partial<Notification>): Notification => ({
  id: 'n1',
  user_id: 'u1',
  type: 'comment_mention',
  title: 'Someone mentioned you',
  body: '',
  icon: 'at-sign',
  priority: 'medium',
  reference_type: 'comment',
  reference_id: 'C1',
  reference_url: null,
  scheduled_for: '2026-05-15T00:00:00Z',
  delivered_at: null,
  read_at: null,
  dismissed_at: null,
  push_sent: false,
  created_at: '2026-05-15T00:00:00Z',
  category: 'tasks',
  source_module: 'notifications-v2',
  action_required: false,
  action_type: null,
  expires_at: null,
  metadata: {},
  updated_at: null,
  ...over,
});

describe('parentDeepLinkPath', () => {
  it('builds /tasks?taskId=<id> for parent_entity_type=task', () => {
    expect(parentDeepLinkPath('task', 'T1')).toBe('/tasks?taskId=T1');
  });

  it('returns null for unknown parent types (project/document/etc. not yet wired)', () => {
    expect(parentDeepLinkPath('project', 'P1')).toBeNull();
    expect(parentDeepLinkPath('document', 'D1')).toBeNull();
    expect(parentDeepLinkPath('procurement', 'X1')).toBeNull();
  });

  it('returns null when id is missing', () => {
    expect(parentDeepLinkPath('task', null)).toBeNull();
    expect(parentDeepLinkPath('task', undefined)).toBeNull();
    expect(parentDeepLinkPath(null, null)).toBeNull();
  });
});

describe('commentDeepLinkPath', () => {
  it('appends commentId query param and hash anchor for task parent', () => {
    expect(commentDeepLinkPath('task', 'T1', 'C1')).toBe(
      '/tasks?taskId=T1&commentId=C1#comment-C1',
    );
  });

  it('returns null when comment id is missing', () => {
    expect(commentDeepLinkPath('task', 'T1', null)).toBeNull();
    expect(commentDeepLinkPath('task', 'T1', undefined)).toBeNull();
  });

  it('returns null when parent is not wired (unknown type)', () => {
    expect(commentDeepLinkPath('project', 'P1', 'C1')).toBeNull();
    expect(commentDeepLinkPath(null, 'X1', 'C1')).toBeNull();
  });

  it('returns null when parent id is missing', () => {
    expect(commentDeepLinkPath('task', null, 'C1')).toBeNull();
  });
});

describe('entityUrl (server email link builder)', () => {
  const origBase = process.env.NEXTAUTH_URL;
  beforeEach(() => {
    process.env.NEXTAUTH_URL = 'https://example.test';
  });
  afterEach(() => {
    if (origBase === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = origBase;
  });

  it('builds a comment deep link from entity_id + parent_entity_id, ignoring reference_url', () => {
    const url = entityUrl({
      reference_url: '/tasks',
      entity_type: 'comment',
      entity_id: 'C1',
      parent_entity_type: 'task',
      parent_entity_id: 'T1',
    });
    expect(url).toBe('https://example.test/tasks?taskId=T1&commentId=C1#comment-C1');
  });

  it('falls back to bare base URL when comment has no wired parent', () => {
    const url = entityUrl({
      entity_type: 'comment',
      entity_id: 'C1',
      parent_entity_type: 'document',
      parent_entity_id: 'D1',
    });
    expect(url).toBe('https://example.test');
  });

  it('honors reference_url for non-comment rows', () => {
    const url = entityUrl({
      reference_url: '/oversight',
      entity_type: 'task',
      entity_id: 'T1',
    });
    expect(url).toBe('https://example.test/oversight');
  });

  it('deep-links a plain task row to /tasks?taskId=...', () => {
    const url = entityUrl({
      entity_type: 'task',
      entity_id: 'T1',
    });
    expect(url).toBe('https://example.test/tasks?taskId=T1');
  });

  it('falls back to /tasks when task has no id', () => {
    const url = entityUrl({ entity_type: 'task' });
    expect(url).toBe('https://example.test/tasks');
  });
});

describe('resolveNotificationUrl (in-app click handler)', () => {
  it('returns a comment deep link for entity_type=comment with task parent', () => {
    const n = baseNotif({
      entity_type: 'comment',
      entity_id: 'C1',
      parent_entity_type: 'task',
      parent_entity_id: 'T1',
      reference_url: '/tasks',
    });
    expect(resolveNotificationUrl(n)).toBe('/tasks?taskId=T1&commentId=C1#comment-C1');
  });

  it('does not get short-circuited by legacy reference_url=/tasks on comment rows', () => {
    const n = baseNotif({
      entity_type: 'comment',
      entity_id: 'C1',
      parent_entity_type: 'task',
      parent_entity_id: 'T1',
      reference_url: '/tasks',
    });
    expect(resolveNotificationUrl(n)).not.toBe('/tasks');
  });

  it('falls back to existing logic for non-comment rows', () => {
    const n = baseNotif({
      entity_type: 'task',
      reference_type: 'task',
      reference_id: 'T1',
      reference_url: '/oversight',
    });
    expect(resolveNotificationUrl(n)).toBe('/oversight');
  });
});
