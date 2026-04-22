import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase chain-mocking harness ──────────────────────────────────────────
// Matches the pattern in lib/tender/__tests__/queries.test.ts. Each call to
// supabaseAdmin.from(...) returns a thenable proxy; tests set the result that
// the awaited chain resolves to.

type ChainResult = { data: unknown; error: null | Error; count?: number };
type Call = { method: string; args: unknown[] };

function makeChain(result: ChainResult = { data: [], error: null }) {
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

const fromMock = vi.fn<(table: string) => unknown>();

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: (table: string) => fromMock(table),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock the shared queries so we don't re-test their internals — signals.ts
// composes them, so we stub the public surface.
const getProjectsMock = vi.fn();
const listTendersMock = vi.fn();

vi.mock('@/lib/delayed-projects/queries', () => ({
  getProjects: (...args: unknown[]) => getProjectsMock(...args),
}));

vi.mock('@/lib/tender/queries', () => ({
  listTenders: (...args: unknown[]) => listTendersMock(...args),
}));

import {
  fetchDelayedProjectSignals,
  fetchTenderSlaSignals,
  fetchMeetingActionSignals,
  fetchStagnantTenderSignals,
  getStalledProjectIds,
  getTodaySignals,
} from '@/lib/today/signals';

const NOW = new Date('2026-04-21T12:00:00Z');

function baseDelayed(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    project_reference: 'R-1',
    executing_agency: 'MPUA',
    sub_agency: 'GPL',
    project_name: 'Substation upgrade',
    region: 'R4',
    tender_board_type: null,
    contract_value: 1_000_000,
    contractors: null,
    project_end_date: '2025-12-01',
    completion_percent: 40,
    has_images: false,
    status: 'active',
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    days_overdue: 100,
    remaining_value: 600_000,
    risk_tier: 'HIGH' as const,
    delta_completion: null,
    stalled_weeks: null,
    intervention_count: 0,
    ...overrides,
  };
}

function baseTender(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    source: 'psip',
    external_id: null,
    description: 'Procurement of X',
    agency: 'GPL',
    programme_code: null,
    sub_programme_code: null,
    programme_activity: null,
    line_item_code: null,
    stage: 'evaluation',
    stage_source: 'status_column',
    method: 'open_tender',
    is_rollover: false,
    has_exception: false,
    date_advertised: null,
    date_closed: null,
    date_eval_sent_mtb_rtb: null,
    date_eval_sent_nptab: null,
    date_of_award: null,
    contractor: null,
    implementation_start_date: null,
    implementation_end_date: null,
    implementation_status_pct: null,
    remarks: null,
    missing_from_last_upload: false,
    first_seen_upload_id: null,
    last_seen_upload_id: null,
    awarded_at: null,
    first_appearance_already_awarded: false,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    agency_name: 'Guyana Power & Light',
    days_at_current_stage: 40,
    ...overrides,
  };
}

beforeEach(() => {
  fromMock.mockReset();
  getProjectsMock.mockReset();
  listTendersMock.mockReset();
});

// ── getStalledProjectIds ─────────────────────────────────────────────────────
// First query fetches distinct snapshot_dates; second fetches snapshots for
// the two most recent dates. Tests mock both calls in order.

function mockStalledQueries(opts: {
  dates: string[];
  snapshotsByDate: Record<string, { project_id: string; completion_percent: number | null }[]>;
  datesError?: Error;
  snapshotsError?: Error;
}) {
  const dateRows = opts.dates.map((d) => ({ snapshot_date: d }));
  fromMock.mockImplementationOnce(
    () => makeChain({ data: opts.datesError ? null : dateRows, error: opts.datesError ?? null }).chain,
  );
  if (opts.datesError) return;
  if (opts.dates.length < 2) return; // short-circuits before 2nd query
  const rows = opts.dates.flatMap((d) =>
    (opts.snapshotsByDate[d] || []).map((r) => ({ ...r, snapshot_date: d })),
  );
  fromMock.mockImplementationOnce(
    () => makeChain({ data: opts.snapshotsError ? null : rows, error: opts.snapshotsError ?? null }).chain,
  );
}

describe('getStalledProjectIds', () => {
  it('returns empty when no snapshots exist', async () => {
    mockStalledQueries({ dates: [], snapshotsByDate: {} });
    expect(await getStalledProjectIds()).toEqual([]);
  });

  it('returns empty when only one snapshot_date exists (single-upload DB)', async () => {
    mockStalledQueries({
      dates: ['2026-04-20'],
      snapshotsByDate: {
        '2026-04-20': [{ project_id: 'a', completion_percent: 50 }],
      },
    });
    expect(await getStalledProjectIds()).toEqual([]);
  });

  it('flags projects whose |Δ| < 1 between the two most recent snapshot_dates', async () => {
    mockStalledQueries({
      dates: ['2026-04-20', '2026-04-13'],
      snapshotsByDate: {
        '2026-04-20': [
          { project_id: 'a', completion_percent: 50.2 },  // stalled (Δ 0.2)
          { project_id: 'b', completion_percent: 55 },    // moved (Δ 7)
          { project_id: 'c', completion_percent: 30 },    // no prior → skipped
          { project_id: 'd', completion_percent: 61 },    // Δ 1.0 exactly → NOT stalled
        ],
        '2026-04-13': [
          { project_id: 'a', completion_percent: 50.0 },
          { project_id: 'b', completion_percent: 48 },
          { project_id: 'd', completion_percent: 60 },
        ],
      },
    });
    expect(await getStalledProjectIds()).toEqual(['a']);
  });

  it('returns [] when the dates query errors', async () => {
    mockStalledQueries({ dates: [], snapshotsByDate: {}, datesError: new Error('boom') });
    expect(await getStalledProjectIds()).toEqual([]);
  });

  it('returns [] when the snapshots query errors', async () => {
    mockStalledQueries({
      dates: ['2026-04-20', '2026-04-13'],
      snapshotsByDate: {},
      snapshotsError: new Error('boom'),
    });
    expect(await getStalledProjectIds()).toEqual([]);
  });
});

// ── fetchDelayedProjectSignals ───────────────────────────────────────────────

describe('fetchDelayedProjectSignals', () => {
  it('maps HIGH-risk projects to signals with severity by days_overdue', async () => {
    getProjectsMock.mockResolvedValueOnce({
      projects: [
        baseDelayed({ id: 'p1', days_overdue: 100 }), // critical
        baseDelayed({ id: 'p2', days_overdue: 45 }),  // high
        baseDelayed({ id: 'p3', days_overdue: 5 }),   // medium
      ],
      total: 3,
    });
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain); // stalled

    const signals = await fetchDelayedProjectSignals('dg', null, NOW);

    expect(signals).toHaveLength(3);
    const byId = Object.fromEntries(signals.map((s) => [s.sourceId, s]));
    expect(byId.p1.severity).toBe('critical');
    expect(byId.p2.severity).toBe('high');
    expect(byId.p3.severity).toBe('medium');
    for (const s of signals) {
      expect(s.kind).toBe('delayed_project');
      expect(s.id).toBe(`delayed_project:${s.sourceId}`);
      expect(s.href).toBe(`/oversight?project=${s.sourceId}`);
      expect(s.agency).toBe('GPL');
      expect(s.computedAt).toBe(NOW.toISOString());
    }
  });

  it('passes agencyFilter for non-ministry roles, undefined for ministry', async () => {
    getProjectsMock.mockResolvedValue({ projects: [], total: 0 });
    fromMock.mockImplementation(() => makeChain({ data: [], error: null }).chain);

    await fetchDelayedProjectSignals('dg', 'GPL', NOW);
    expect(getProjectsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ risk_tiers: ['HIGH'] }),
      undefined,
    );

    await fetchDelayedProjectSignals('agency_admin', 'GPL', NOW);
    expect(getProjectsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ risk_tiers: ['HIGH'] }),
      'GPL',
    );
  });

  it('unions stalled-only project ids with HIGH results', async () => {
    getProjectsMock.mockResolvedValueOnce({
      projects: [baseDelayed({ id: 'high1', days_overdue: 100 })],
      total: 1,
    });
    mockStalledQueries({
      dates: ['2026-04-20', '2026-04-13'],
      snapshotsByDate: {
        '2026-04-20': [{ project_id: 'stall1', completion_percent: 20.1 }],
        '2026-04-13': [{ project_id: 'stall1', completion_percent: 20.0 }],
      },
    });
    // Backfill query for stalled-only rows: returns a non-HIGH row.
    fromMock.mockImplementationOnce(
      () =>
        makeChain({
          data: [
            {
              ...baseDelayed({
                id: 'stall1',
                project_name: 'Stalled pipeline',
                sub_agency: 'GWI',
                completion_percent: 20,
                project_end_date: '2027-01-01',
                contract_value: 500_000,
              }),
            },
          ],
          error: null,
        }).chain,
    );

    const signals = await fetchDelayedProjectSignals('dg', null, NOW);
    const ids = signals.map((s) => s.sourceId).sort();
    expect(ids).toEqual(['high1', 'stall1']);
    const stall = signals.find((s) => s.sourceId === 'stall1')!;
    expect(stall.metric).toContain('stalled');
  });
});

// ── fetchTenderSlaSignals ────────────────────────────────────────────────────

describe('fetchTenderSlaSignals', () => {
  it('excludes tenders in the award stage and tenders within SLA', async () => {
    listTendersMock.mockResolvedValueOnce([
      baseTender({ id: 't-award', stage: 'award', days_at_current_stage: 999 }),
      baseTender({ id: 't-under', stage: 'evaluation', days_at_current_stage: 30 }), // SLA 30, over=0
      baseTender({ id: 't-over', stage: 'evaluation', days_at_current_stage: 31 }),
    ]);

    const signals = await fetchTenderSlaSignals('dg', null, NOW);
    expect(signals.map((s) => s.sourceId)).toEqual(['t-over']);
    expect(signals[0].metric).toContain('Evaluation');
    expect(signals[0].metric).toContain('over SLA');
  });

  it('applies severity bands per stage (design has no SLA, skipped)', async () => {
    listTendersMock.mockResolvedValueOnce([
      baseTender({ id: 't-design', stage: 'design', days_at_current_stage: 75 }),            // no SLA → skipped
      baseTender({ id: 't-ad-crit', stage: 'advertised', days_at_current_stage: 60 }),       // over=30 → critical
      baseTender({ id: 't-ad-high', stage: 'advertised', days_at_current_stage: 44 }),       // over=14 → high
      baseTender({ id: 't-eval-med', stage: 'evaluation', days_at_current_stage: 31 }),      // over=1  → medium
      baseTender({ id: 't-aa-high', stage: 'awaiting_award', days_at_current_stage: 35 }),   // over=14 → high
    ]);

    const signals = await fetchTenderSlaSignals('dg', null, NOW);
    const sev = Object.fromEntries(signals.map((s) => [s.sourceId, s.severity]));
    expect(sev).toEqual({
      't-ad-crit': 'critical',
      't-ad-high': 'high',
      't-eval-med': 'medium',
      't-aa-high': 'high',
    });
  });

  it('skips tenders where days_at_current_stage is null (PSIP date missing)', async () => {
    listTendersMock.mockResolvedValueOnce([
      baseTender({ id: 't-null', stage: 'advertised', days_at_current_stage: null }),
      baseTender({ id: 't-ok', stage: 'advertised', days_at_current_stage: 45 }),
    ]);

    const signals = await fetchTenderSlaSignals('dg', null, NOW);
    expect(signals.map((s) => s.sourceId)).toEqual(['t-ok']);
  });

  it('skips rollover and has_exception tenders even with an over-SLA number', async () => {
    listTendersMock.mockResolvedValueOnce([
      baseTender({ id: 't-roll', stage: 'evaluation', days_at_current_stage: 60, is_rollover: true }),
      baseTender({ id: 't-exc', stage: 'evaluation', days_at_current_stage: 60, has_exception: true }),
      baseTender({ id: 't-ok', stage: 'evaluation', days_at_current_stage: 60 }),
    ]);

    const signals = await fetchTenderSlaSignals('dg', null, NOW);
    expect(signals.map((s) => s.sourceId)).toEqual(['t-ok']);
  });

  it('passes agency filter for non-ministry roles, undefined for ministry', async () => {
    listTendersMock.mockResolvedValue([]);

    await fetchTenderSlaSignals('dg', 'GPL', NOW);
    expect(listTendersMock).toHaveBeenLastCalledWith({ agency: undefined });

    await fetchTenderSlaSignals('officer', 'GWI', NOW);
    expect(listTendersMock).toHaveBeenLastCalledWith({ agency: 'GWI' });
  });
});

// ── fetchStagnantTenderSignals ───────────────────────────────────────────────

describe('fetchStagnantTenderSignals — severity bands', () => {
  function stagnantRow(id: string, agency: string, weeks: number, stage = 'advertised') {
    return {
      id,
      description: `tender ${id}`,
      agency,
      stage,
      stagnant_weeks: weeks,
      updated_at: NOW.toISOString(),
    };
  }

  it('does not surface stagnant_weeks below the threshold (2 → none)', async () => {
    // Rows under 3 are filtered at the DB; the fetcher won't see them. Simulate
    // by returning an empty set — asserts the query path works.
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain);
    const out = await fetchStagnantTenderSignals('dg', null, NOW);
    expect(out).toEqual([]);
  });

  it('returns a medium signal at weeks = 3 (threshold)', async () => {
    fromMock.mockImplementationOnce(
      () => makeChain({ data: [stagnantRow('t-a', 'GPL', 3)], error: null }).chain,
    );
    const out = await fetchStagnantTenderSignals('dg', null, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('medium');
    expect(out[0].kind).toBe('stagnant_tender');
  });

  it('returns a medium at weeks = 4, high at 5, high at 7, critical at 8', async () => {
    fromMock.mockImplementationOnce(
      () =>
        makeChain({
          data: [
            stagnantRow('t4', 'GPL', 4),
            stagnantRow('t5', 'GWI', 5),
            stagnantRow('t7', 'CJIA', 7),
            stagnantRow('t8', 'GCAA', 8),
          ],
          error: null,
        }).chain,
    );
    const out = await fetchStagnantTenderSignals('dg', null, NOW);
    const sev = Object.fromEntries(out.map((s) => [s.sourceId, s.severity]));
    expect(sev).toEqual({ t4: 'medium', t5: 'high', t7: 'high', t8: 'critical' });
  });
});

describe('fetchStagnantTenderSignals — agency rollup', () => {
  function rows(n: number, agency: string, weeks = 4): Array<{
    id: string; description: string; agency: string; stage: string; stagnant_weeks: number; updated_at: string;
  }> {
    return Array.from({ length: n }, (_, i) => ({
      id: `${agency}-${i}`,
      description: `tender ${agency} ${i}`,
      agency,
      stage: 'advertised',
      stagnant_weeks: weeks,
      updated_at: NOW.toISOString(),
    }));
  }

  it('emits individuals when agency count < 3 (count=2)', async () => {
    fromMock.mockImplementationOnce(() => makeChain({ data: rows(2, 'GPL'), error: null }).chain);
    const out = await fetchStagnantTenderSignals('dg', null, NOW);
    expect(out.map((s) => s.kind)).toEqual(['stagnant_tender', 'stagnant_tender']);
  });

  it('emits one rollup (replaces individuals) when count = 3 (threshold)', async () => {
    fromMock.mockImplementationOnce(() => makeChain({ data: rows(3, 'GPL'), error: null }).chain);
    const out = await fetchStagnantTenderSignals('dg', null, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('agency_stagnant_rollup');
    expect(out[0].agency).toBe('GPL');
    expect(out[0].severity).toBe('medium');
    expect(out[0].title).toContain('3 stagnant tenders');
  });

  it('rollup severity: medium at 4, high at 5, high at 9, critical at 10', async () => {
    for (const [count, expected] of [[4, 'medium'], [5, 'high'], [9, 'high'], [10, 'critical']] as const) {
      fromMock.mockImplementationOnce(() => makeChain({ data: rows(count, 'GPL'), error: null }).chain);
      const out = await fetchStagnantTenderSignals('dg', null, NOW);
      expect(out).toHaveLength(1);
      expect(out[0].severity).toBe(expected);
    }
  });

  it('rollup in one agency does not suppress individuals in another', async () => {
    fromMock.mockImplementationOnce(
      () => makeChain({ data: [...rows(3, 'GPL'), ...rows(2, 'GWI')], error: null }).chain,
    );
    const out = await fetchStagnantTenderSignals('dg', null, NOW);
    const gplSignals = out.filter((s) => s.agency === 'GPL');
    const gwiSignals = out.filter((s) => s.agency === 'GWI');
    expect(gplSignals).toHaveLength(1);
    expect(gplSignals[0].kind).toBe('agency_stagnant_rollup');
    expect(gwiSignals).toHaveLength(2);
    expect(gwiSignals.every((s) => s.kind === 'stagnant_tender')).toBe(true);
  });

  it('agency user scoping: passes upper-cased agency filter to the query', async () => {
    const chain = makeChain({ data: [], error: null });
    fromMock.mockImplementationOnce(() => chain.chain);
    await fetchStagnantTenderSignals('agency_admin', 'gpl', NOW);
    const eqCalls = chain.calls.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['agency', 'GPL'] });
  });

  it('no agency filter for ministry roles', async () => {
    const chain = makeChain({ data: [], error: null });
    fromMock.mockImplementationOnce(() => chain.chain);
    await fetchStagnantTenderSignals('dg', null, NOW);
    const eqCalls = chain.calls.filter((c) => c.method === 'eq');
    expect(eqCalls).not.toContainEqual(expect.objectContaining({ args: expect.arrayContaining(['agency']) }));
  });
});

// ── fetchMeetingActionSignals ────────────────────────────────────────────────

describe('fetchMeetingActionSignals', () => {
  it('returns [] for non-ministry roles without touching the DB (agency scoping note)', async () => {
    const out = await fetchMeetingActionSignals('agency_admin', 'GPL', NOW);
    expect(out).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('maps open actions to signals with severity by days past due', async () => {
    fromMock.mockImplementationOnce(
      () =>
        makeChain({
          data: [
            {
              id: 'a-crit',
              task: 'Follow up with contractor',
              owner: 'Alfonso',
              due_date: '2026-04-01', // 20d past → critical
              meeting_id: 'm1',
              created_at: '2026-03-01T00:00:00Z',
              meetings: { id: 'm1', title: 'Weekly sync' },
            },
            {
              id: 'a-high',
              task: 'Send revised timeline',
              owner: null,
              due_date: '2026-04-18', // 3d past → high
              meeting_id: 'm1',
              created_at: '2026-04-10T00:00:00Z',
              meetings: { id: 'm1', title: 'Weekly sync' },
            },
            {
              id: 'a-med-upcoming',
              task: 'Draft MOU',
              owner: null,
              due_date: '2026-04-25', // 4d out → medium
              meeting_id: 'm1',
              created_at: '2026-04-10T00:00:00Z',
              meetings: { id: 'm1', title: 'Weekly sync' },
            },
            {
              id: 'a-med-nodue',
              task: 'Ancient no-due item',
              owner: null,
              due_date: null,
              meeting_id: 'm1',
              created_at: '2026-03-01T00:00:00Z', // 51d old → medium
              meetings: { id: 'm1', title: 'Weekly sync' },
            },
            {
              id: 'a-drop-far',
              task: 'Far-future item',
              owner: null,
              due_date: '2027-01-01', // > 7d out → dropped
              meeting_id: 'm1',
              created_at: '2026-04-15T00:00:00Z',
              meetings: { id: 'm1', title: 'Weekly sync' },
            },
            {
              id: 'a-drop-new-nodue',
              task: 'New no-due item',
              owner: null,
              due_date: null,
              meeting_id: 'm1',
              created_at: '2026-04-20T00:00:00Z', // 1d old → dropped
              meetings: { id: 'm1', title: 'Weekly sync' },
            },
          ],
          error: null,
        }).chain,
    );

    const signals = await fetchMeetingActionSignals('dg', null, NOW);
    const sev = Object.fromEntries(signals.map((s) => [s.sourceId, s.severity]));
    expect(sev).toEqual({
      'a-crit': 'critical',
      'a-high': 'high',
      'a-med-upcoming': 'medium',
      'a-med-nodue': 'medium',
    });
    for (const s of signals) {
      expect(s.kind).toBe('meeting_action');
      expect(s.href).toBe('/meetings?id=m1');
      expect(s.subtitle).toBe('Weekly sync');
    }
  });

  it('throws on DB error so the orchestrator marks the source unhealthy', async () => {
    fromMock.mockImplementationOnce(
      () => makeChain({ data: null, error: new Error('db down') }).chain,
    );
    await expect(fetchMeetingActionSignals('dg', null, NOW)).rejects.toThrow('db down');
  });
});

// ── getTodaySignals orchestrator ─────────────────────────────────────────────

describe('getTodaySignals', () => {
  it('aggregates all four sources, sorts by severity then ageDays desc, caps at 50', async () => {
    getProjectsMock.mockResolvedValueOnce({
      projects: [
        baseDelayed({ id: 'dp-crit', days_overdue: 200 }),
        baseDelayed({ id: 'dp-high', days_overdue: 40 }),
      ],
      total: 2,
    });
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain); // stalled

    listTendersMock.mockResolvedValueOnce([
      baseTender({ id: 't-crit', stage: 'advertised', days_at_current_stage: 75 }), // over=45 → critical
    ]);

    fromMock.mockImplementationOnce(
      () =>
        makeChain({
          data: [
            {
              id: 'ma-crit',
              task: 'Act',
              owner: null,
              due_date: '2026-03-01', // 51d past → critical
              meeting_id: 'm1',
              created_at: '2026-02-01T00:00:00Z',
              meetings: { id: 'm1', title: 'M1' },
            },
          ],
          error: null,
        }).chain,
    );

    // stagnant_tender query returns empty (no 2nd upload yet in this fixture)
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain);

    const out = await getTodaySignals('user-1', 'dg', null, NOW);

    expect(out.counts.total).toBe(4);
    expect(out.counts.critical).toBe(3);
    expect(out.counts.high).toBe(1);
    expect(out.sources.delayed_projects.ok).toBe(true);
    expect(out.sources.tenders.ok).toBe(true);
    expect(out.sources.meeting_actions.ok).toBe(true);
    expect(out.sources.stagnant_tenders.ok).toBe(true);

    // Within critical bucket, ageDays desc then kind-rank.
    // ageDays: dp-crit=200, ma-crit=51, t-crit=45. Expect that order.
    const criticalIds = out.signals.filter((s) => s.severity === 'critical').map((s) => s.sourceId);
    expect(criticalIds).toEqual(['dp-crit', 'ma-crit', 't-crit']);
  });

  it('isolates source failures — one rejection does not sink the others', async () => {
    // Delayed: succeed
    getProjectsMock.mockResolvedValueOnce({
      projects: [baseDelayed({ id: 'dp1', days_overdue: 100 })],
      total: 1,
    });
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain); // stalled

    // Tenders: throw
    listTendersMock.mockRejectedValueOnce(new Error('tender fetch failed'));

    // Meetings: succeed (empty)
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain);

    // Stagnant: succeed (empty)
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain);

    const out = await getTodaySignals('user-1', 'dg', null, NOW);

    expect(out.sources.delayed_projects.ok).toBe(true);
    expect(out.sources.tenders.ok).toBe(false);
    expect(out.sources.tenders.error).toContain('tender fetch failed');
    expect(out.sources.meeting_actions.ok).toBe(true);
    expect(out.sources.stagnant_tenders.ok).toBe(true);
    expect(out.signals.map((s) => s.sourceId)).toEqual(['dp1']);
  });

  it('agency user sees only their own agency across delayed + tenders + stagnant, and no meeting actions', async () => {
    getProjectsMock.mockResolvedValueOnce({
      projects: [baseDelayed({ id: 'gpl1', sub_agency: 'GPL', days_overdue: 100 })],
      total: 1,
    });
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain); // stalled

    listTendersMock.mockResolvedValueOnce([
      baseTender({ id: 'tg1', agency: 'GPL', stage: 'advertised', days_at_current_stage: 65 }),
    ]);

    // Stagnant query (for the agency_admin): empty. Agency users can still see
    // stagnant signals from their own agency (unlike meeting actions).
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain);

    const out = await getTodaySignals('user-1', 'agency_admin', 'GPL', NOW);

    expect(getProjectsMock).toHaveBeenCalledWith(expect.any(Object), 'GPL');
    expect(listTendersMock).toHaveBeenCalledWith({ agency: 'GPL' });
    expect(out.signals.filter((s) => s.kind === 'meeting_action')).toEqual([]);
    // 2 fromMock calls: stalled + stagnant. Meetings path never ran (non-ministry).
    expect(fromMock).toHaveBeenCalledTimes(2);
  });
});
