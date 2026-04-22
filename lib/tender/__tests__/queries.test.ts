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

// ── computeDaysInStage — pure PSIP-date-driven calculation ───────────────────

import { computeDaysInStage } from '@/lib/tender/queries';

const NOW = new Date('2026-04-21T00:00:00Z');

describe('computeDaysInStage — stage × date matrix', () => {
  it('advertised stage uses date_advertised; returns days since', () => {
    expect(
      computeDaysInStage('advertised', { date_advertised: '2026-03-01' }, NOW),
    ).toBe(51);
  });

  it('advertised stage returns null when date_advertised is missing', () => {
    expect(computeDaysInStage('advertised', {}, NOW)).toBeNull();
    expect(computeDaysInStage('advertised', { date_advertised: null }, NOW)).toBeNull();
  });

  it('evaluation stage uses date_closed; returns days since', () => {
    expect(
      computeDaysInStage('evaluation', { date_closed: '2026-03-22' }, NOW),
    ).toBe(30);
  });

  it('evaluation stage returns null when date_closed is missing, even if advertised is present', () => {
    expect(
      computeDaysInStage('evaluation', { date_advertised: '2026-01-01' }, NOW),
    ).toBeNull();
  });

  it('awaiting_award prefers date_eval_sent_nptab over mtb_rtb over closed', () => {
    expect(
      computeDaysInStage('awaiting_award', {
        date_closed: '2026-01-01',
        date_eval_sent_mtb_rtb: '2026-02-01',
        date_eval_sent_nptab: '2026-03-01',
      }, NOW),
    ).toBe(51);
    expect(
      computeDaysInStage('awaiting_award', {
        date_closed: '2026-01-01',
        date_eval_sent_mtb_rtb: '2026-02-01',
      }, NOW),
    ).toBe(79);
    expect(
      computeDaysInStage('awaiting_award', { date_closed: '2026-01-01' }, NOW),
    ).toBe(110);
    expect(
      computeDaysInStage('awaiting_award', {}, NOW),
    ).toBeNull();
  });

  it('design stage always returns null (no SLA before advertised)', () => {
    expect(
      computeDaysInStage('design', { date_advertised: '2026-03-01' }, NOW),
    ).toBeNull();
  });

  it('award stage always returns null (terminal, no SLA)', () => {
    expect(
      computeDaysInStage('award', {
        date_advertised: '2026-01-01',
        date_closed: '2026-02-01',
        date_eval_sent_nptab: '2026-03-01',
      }, NOW),
    ).toBeNull();
  });

  it('is_rollover=true suppresses days calculation regardless of stage', () => {
    expect(
      computeDaysInStage('evaluation', { date_closed: '2026-03-01', is_rollover: true }, NOW),
    ).toBeNull();
  });

  it('has_exception=true suppresses days calculation regardless of stage', () => {
    expect(
      computeDaysInStage('awaiting_award', {
        date_eval_sent_nptab: '2026-03-01',
        has_exception: true,
      }, NOW),
    ).toBeNull();
  });

  it('returns null for malformed date strings rather than NaN', () => {
    expect(
      computeDaysInStage('advertised', { date_advertised: 'not a date' }, NOW),
    ).toBeNull();
  });

  it('never returns negative days (clamps to 0 if reference is in the future)', () => {
    expect(
      computeDaysInStage('advertised', { date_advertised: '2027-01-01' }, NOW),
    ).toBe(0);
  });
});

describe('Stage normalization — PSIP parser normalizes to lowercase enum', () => {
  // The tender_stage enum (migration 078) only contains lowercase values.
  // The PSIP parser already normalizes 'award' / 'Award' at parser.ts:147
  // and returns TenderStage. computeDaysInStage accepts the enum type, so
  // any incoming stage would already be typed. Confirm all enum inputs are
  // accepted without ambiguity.
  it('accepts all 5 enum stage values without ambiguity', () => {
    expect(computeDaysInStage('design', { date_advertised: '2026-03-01' }, NOW)).toBeNull();
    expect(
      computeDaysInStage('advertised', { date_advertised: '2026-03-01' }, NOW),
    ).toBe(51);
    expect(
      computeDaysInStage('evaluation', { date_closed: '2026-03-01' }, NOW),
    ).toBe(51);
    expect(
      computeDaysInStage('awaiting_award', { date_eval_sent_nptab: '2026-03-01' }, NOW),
    ).toBe(51);
    expect(
      computeDaysInStage('award', { date_of_award: '2026-03-01' } as never, NOW),
    ).toBeNull();
  });
});
