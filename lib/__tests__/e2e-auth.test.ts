import { describe, it, expect, afterEach } from 'vitest';
import { e2eAuthEnabled, e2eSessionFromCookie } from '@/lib/e2e-auth';

// The E2E auth affordance skips authentication. It MUST be impossible to activate
// in a production build, and MUST fail closed for any ambiguous environment.
// These tests pin both properties — do not weaken them.

const original = {
  node: process.env.NODE_ENV,
  vercel: process.env.VERCEL_ENV,
  flag: process.env.E2E_AUTH_BYPASS,
};
function setEnv(node: string | undefined, flag: string | undefined, vercel?: string) {
  if (node === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
  else (process.env as Record<string, string>).NODE_ENV = node;
  if (flag === undefined) delete process.env.E2E_AUTH_BYPASS;
  else process.env.E2E_AUTH_BYPASS = flag;
  if (vercel === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercel;
}
afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = original.node;
  if (original.vercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = original.vercel;
  if (original.flag === undefined) delete process.env.E2E_AUTH_BYPASS; else process.env.E2E_AUTH_BYPASS = original.flag;
});

const cookie = encodeURIComponent(JSON.stringify({ id: 'x', role: 'superadmin', agency: null }));

describe('e2e-auth gate — live only in dev/test with the exact flag', () => {
  it('ENABLED in development with the flag', () => {
    setEnv('development', '1');
    expect(e2eAuthEnabled()).toBe(true);
    expect(e2eSessionFromCookie(cookie)).not.toBeNull();
  });
  it('ENABLED in test with the flag', () => {
    setEnv('test', '1');
    expect(e2eAuthEnabled()).toBe(true);
  });
});

describe('e2e-auth gate — fails closed everywhere else', () => {
  it('DEAD in production even with the flag set', () => {
    setEnv('production', '1');
    expect(e2eAuthEnabled()).toBe(false);
    expect(e2eSessionFromCookie(cookie)).toBeNull();
  });
  it('DEAD when VERCEL_ENV=production even if NODE_ENV=development + flag', () => {
    setEnv('development', '1', 'production');
    expect(e2eAuthEnabled()).toBe(false);
  });
  it('DEAD when NODE_ENV is unset, even with the flag', () => {
    setEnv(undefined, '1');
    expect(e2eAuthEnabled()).toBe(false);
  });
  it('DEAD for an unexpected NODE_ENV value, even with the flag', () => {
    setEnv('staging', '1');
    expect(e2eAuthEnabled()).toBe(false);
  });
  it('DEAD in development without the flag', () => {
    setEnv('development', undefined);
    expect(e2eAuthEnabled()).toBe(false);
  });
  it('DEAD for a wrong flag value', () => {
    setEnv('development', 'true');
    expect(e2eAuthEnabled()).toBe(false);
  });
});
