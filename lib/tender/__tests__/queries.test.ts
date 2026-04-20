import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { method: string; args: unknown[] };

function makeChain(result: { data: unknown[]; error: null | Error } = { data: [], error: null }) {
  const calls: Call[] = [];
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => resolve(result);
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  };
  const proxy: unknown = new Proxy({}, handler);
  return { chain: proxy, calls };
}

const fromMock = vi.fn();

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: (table: string) => fromMock(table),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { listTenders, getPipelineStats, listMissingTenders } from '@/lib/tender/queries';

describe('listTenders — rollover exclusion', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('excludes rollovers by default', async () => {
    const tenderCall = makeChain();
    fromMock.mockImplementationOnce(() => tenderCall.chain);

    await listTenders();

    const eqCalls = tenderCall.calls.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['is_rollover', false] });
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['missing_from_last_upload', false] });
  });

  it('includes rollovers when includeRollovers=true', async () => {
    const tenderCall = makeChain();
    fromMock.mockImplementationOnce(() => tenderCall.chain);

    await listTenders({ includeRollovers: true });

    const eqCalls = tenderCall.calls.filter((c) => c.method === 'eq');
    expect(eqCalls).not.toContainEqual({ method: 'eq', args: ['is_rollover', false] });
  });

  it('filters by agency when provided, still excluding rollovers', async () => {
    const tenderCall = makeChain();
    fromMock.mockImplementationOnce(() => tenderCall.chain);

    await listTenders({ agency: 'gpl' });

    const eqCalls = tenderCall.calls.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['agency', 'GPL'] });
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['is_rollover', false] });
  });
});

describe('getPipelineStats — rollover exclusion', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('always excludes rollovers from stage counts', async () => {
    const statsCall = makeChain();
    fromMock.mockImplementationOnce(() => statsCall.chain);

    await getPipelineStats();

    const eqCalls = statsCall.calls.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['is_rollover', false] });
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['missing_from_last_upload', false] });
  });
});

describe('listMissingTenders — admin view keeps rollovers', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('does not apply is_rollover=false so missing rollovers remain visible', async () => {
    const tenderCall = makeChain();
    fromMock.mockImplementationOnce(() => tenderCall.chain);

    await listMissingTenders();

    const eqCalls = tenderCall.calls.filter((c) => c.method === 'eq');
    expect(eqCalls).not.toContainEqual({ method: 'eq', args: ['is_rollover', false] });
    expect(eqCalls).not.toContainEqual({ method: 'eq', args: ['missing_from_last_upload', false] });
  });
});
