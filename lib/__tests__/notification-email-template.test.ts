import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderInstantEmail } from '@/lib/notifications/email-templates';

describe('renderInstantEmail (comment_mention)', () => {
  const origBase = process.env.NEXTAUTH_URL;
  beforeEach(() => {
    process.env.NEXTAUTH_URL = 'https://example.test';
  });
  afterEach(() => {
    if (origBase === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = origBase;
  });

  it('subject names the actor and the parent entity title', () => {
    const { subject } = renderInstantEmail({
      title: 'Alice mentioned you',
      body: 'hey @Bob can you review',
      event_type: 'comment_mention',
      importance_tier: 'important',
      actor_name: 'Alice Smith',
      entity_type: 'comment',
      entity_url: 'https://example.test/tasks?taskId=T1&commentId=C1#comment-C1',
      parent_entity_type: 'task',
      parent_entity_title: 'Budget review for Q3',
      created_at: new Date().toISOString(),
    });
    expect(subject).toBe('[DG Work OS] Alice Smith mentioned you on Task: Budget review for Q3');
  });

  it('falls back to a no-title subject when parent_entity_title is absent', () => {
    const { subject } = renderInstantEmail({
      title: 'Alice mentioned you',
      event_type: 'comment_mention',
      importance_tier: 'important',
      actor_name: 'Alice Smith',
      entity_type: 'comment',
      created_at: new Date().toISOString(),
    });
    expect(subject).toBe('[DG Work OS] Alice Smith mentioned you');
  });

  it('renders the parent entity line, the comment snippet, the timestamp, and the deep-link CTA', () => {
    const { html, text } = renderInstantEmail({
      title: 'Alice mentioned you',
      body: 'hey @Bob can you review the latest figures before tomorrow',
      event_type: 'comment_mention',
      importance_tier: 'important',
      actor_name: 'Alice Smith',
      entity_type: 'comment',
      entity_url: 'https://example.test/tasks?taskId=T1&commentId=C1#comment-C1',
      parent_entity_type: 'task',
      parent_entity_title: 'Budget review for Q3',
      created_at: new Date().toISOString(),
    });

    // CTA points at the deep link
    expect(html).toContain(
      'href="https://example.test/tasks?taskId=T1&commentId=C1#comment-C1"',
    );

    // Parent entity line is present (HTML)
    expect(html).toContain('Task:');
    expect(html).toContain('Budget review for Q3');

    // Comment snippet is present in HTML
    expect(html).toContain('hey @Bob can you review the latest figures before tomorrow');

    // Timestamp line is present (relativeTime returns "just now" for fresh dates)
    expect(html).toContain('just now');

    // Plain text variant includes the same three elements
    expect(text).toContain('Task: Budget review for Q3');
    expect(text).toContain('hey @Bob can you review the latest figures before tomorrow');
    expect(text).toContain('Time: just now');
    expect(text).toContain('View: https://example.test/tasks?taskId=T1&commentId=C1#comment-C1');
  });

  it('escapes HTML in the parent entity title', () => {
    const { html } = renderInstantEmail({
      title: 'mention',
      event_type: 'comment_mention',
      importance_tier: 'important',
      entity_type: 'comment',
      parent_entity_type: 'task',
      parent_entity_title: '<script>alert(1)</script>',
      created_at: new Date().toISOString(),
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
