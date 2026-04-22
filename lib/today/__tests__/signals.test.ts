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

  it('applies severity bands per stage', async () => {
    listTendersMock.mockResolvedValueOnce([
      baseTender({ id: 't-design-crit', stage: 'design', days_at_current_stage: 75 }),       // over=30 → critical
      baseTender({ id: 't-ad-high', stage: 'advertised', days_at_current_stage: 44 }),       // over=14 → high
      baseTender({ id: 't-eval-med', stage: 'evaluation', days_at_current_stage: 31 }),      // over=1  → medium
      baseTender({ id: 't-aa-high', stage: 'awaiting_award', days_at_current_stage: 35 }),   // over=14 → high
    ]);

    const signals = await fetchTenderSlaSignals('dg', null, NOW);
    const sev = Object.fromEntries(signals.map((s) => [s.sourceId, s.severity]));
    expect(sev).toEqual({
      't-design-crit': 'critical',
      't-ad-high': 'high',
      't-eval-med': 'medium',
      't-aa-high': 'high',
    });
  });

  it('passes agency filter for non-ministry roles, undefined for ministry', async () => {
    listTendersMock.mockResolvedValue([]);

    await fetchTenderSlaSignals('dg', 'GPL', NOW);
    expect(listTendersMock).toHaveBeenLastCalledWith({ agency: undefined });

    await fetchTenderSlaSignals('officer', 'GWI', NOW);
    expect(listTendersMock).toHaveBeenLastCalledWith({ agency: 'GWI' });
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
  it('aggregates all three sources, sorts by severity then ageDays desc, caps at 50', async () => {
    getProjectsMock.mockResolvedValueOnce({
      projects: [
        baseDelayed({ id: 'dp-crit', days_overdue: 200 }),
        baseDelayed({ id: 'dp-high', days_overdue: 40 }),
      ],
      total: 2,
    });
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain); // stalled

    listTendersMock.mockResolvedValueOnce([
      baseTender({ id: 't-crit', stage: 'design', days_at_current_stage: 90 }), // over=45 → critical
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

    const out = await getTodaySignals('user-1', 'dg', null, NOW);

    expect(out.counts.total).toBe(4);
    expect(out.counts.critical).toBe(3);
    expect(out.counts.high).toBe(1);
    expect(out.sources.delayed_projects.ok).toBe(true);
    expect(out.sources.tenders.ok).toBe(true);
    expect(out.sources.meeting_actions.ok).toBe(true);

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

    const out = await getTodaySignals('user-1', 'dg', null, NOW);

    expect(out.sources.delayed_projects.ok).toBe(true);
    expect(out.sources.tenders.ok).toBe(false);
    expect(out.sources.tenders.error).toContain('tender fetch failed');
    expect(out.sources.meeting_actions.ok).toBe(true);
    expect(out.signals.map((s) => s.sourceId)).toEqual(['dp1']);
  });

  it('agency user sees only their own agency across delayed + tenders, and no meeting actions', async () => {
    getProjectsMock.mockResolvedValueOnce({
      projects: [baseDelayed({ id: 'gpl1', sub_agency: 'GPL', days_overdue: 100 })],
      total: 1,
    });
    fromMock.mockImplementationOnce(() => makeChain({ data: [], error: null }).chain);

    listTendersMock.mockResolvedValueOnce([
      baseTender({ id: 'tg1', agency: 'GPL', stage: 'design', days_at_current_stage: 80 }),
    ]);

    const out = await getTodaySignals('user-1', 'agency_admin', 'GPL', NOW);

    expect(getProjectsMock).toHaveBeenCalledWith(expect.any(Object), 'GPL');
    expect(listTendersMock).toHaveBeenCalledWith({ agency: 'GPL' });
    expect(out.signals.filter((s) => s.kind === 'meeting_action')).toEqual([]);
    // from mock was only called once (for the stalled query); meetings path never ran.
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});
