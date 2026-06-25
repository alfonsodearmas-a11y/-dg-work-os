import { describe, it, expect, afterEach } from 'vitest';
import { e2eAuthEnabled, e2eSessionFromCookie } from '@/lib/e2e-auth';

// The E2E auth affordance is security-sensitive: it MUST be impossible to activate
// in a production build. These tests lock that in.

const original = { node: process.env.NODE_ENV, flag: process.env.E2E_AUTH_BYPASS };
afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = original.node;
  if (original.flag === undefined) delete process.env.E2E_AUTH_BYPASS;
  else process.env.E2E_AUTH_BYPASS = original.flag;
});

const cookie = encodeURIComponent(JSON.stringify({ id: 'x', role: 'superadmin', agency: null }));

describe('e2e-auth gate', () => {
  it('is enabled ONLY in non-production with the explicit flag', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    process.env.E2E_AUTH_BYPASS = '1';
    expect(e2eAuthEnabled()).toBe(true);
    expect(e2eSessionFromCookie(cookie)).not.toBeNull();
  });

  it('is DEAD in production even when the flag is set', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.E2E_AUTH_BYPASS = '1';
    expect(e2eAuthEnabled()).toBe(false);
    expect(e2eSessionFromCookie(cookie)).toBeNull();
  });

  it('is disabled without the explicit flag', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    delete process.env.E2E_AUTH_BYPASS;
    expect(e2eAuthEnabled()).toBe(false);
  });
});
