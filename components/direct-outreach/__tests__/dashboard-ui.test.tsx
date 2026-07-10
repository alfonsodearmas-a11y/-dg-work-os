// @vitest-environment jsdom
//
// Direct Outreach list page — presentation-reorg contract tests.
// Verifies the Cases|Overview tabs, the compact stat strip, the default
// chips + "More filters" disclosure, and the single Sort control all emit
// EXACTLY the same /api/direct-outreach list params as the UI they replaced.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DirectOutreachDashboard } from '@/components/direct-outreach/DirectOutreachDashboard';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/providers/ViewAsProvider', () => ({
  useEffectiveUser: () => ({
    effectiveUser: { id: 'user-super', name: 'Test Super', role: 'superadmin', agency: null },
  }),
}));

const totals = {
  total: 40, resolved: 10, open: 30, resolution_rate: 25,
  stalled_60: 5, stalled_90: 2, overdue_commitments: 3, with_target: 8,
  transferred_in: 1, unassigned_open: 4, stale_officer: 6, officer_overdue: 2,
};

const summaryPayload = {
  totals,
  agencies: [{
    agency: 'GWI', total: 20, resolved: 5, open: 15, resolution_rate: 25,
    stalled_60: 3, stalled_90: 1, overdue_commitments: 2, with_target: 4,
    transferred_in: 1, unassigned: 2, stale_officer: 3, officer_overdue: 1,
  }],
  officer_load: [{
    id: 'off-1', name: 'Alice Persaud', agency: 'GWI',
    open_cases: 3, stale_cases: 1, overdue_commitments: 0, last_update_at: null,
  }],
  filter_options: {
    regions: ['Region 4'],
    outreach_locations: ['Anna Regina'],
    officers: [{ id: 'off-1', name: 'Alice Persaud' }],
  },
  last_synced_at: null, cases_seen: null, updates_seen: null,
};

const caseRow = {
  case_id: 101, client_name: 'John Doe', client_address: null,
  agency: 'GWI', effective_agency: 'GWI', transferred: false,
  status: 'Open', priority_flag: 'Normal', theme: 'Water-Supply',
  description: 'No water', category_name: null, outreach_location: null,
  outreach_date: null, region: null, point_person: null, created_at: '2026-01-01',
  assignee_user_id: null, assignee_name: null, assigned_at: null,
  latest_update: null, latest_update_date: null, latest_update_by: null,
  comment_count: 0, days_open: 10, days_idle: 5, age_bucket: '0-30 days',
  committed_date: null, committed_source: null, committed_by: null, committed_overdue: false,
  working_status: 'not_started', officer_target_date: null, officer_target_overdue: false,
  effective_target_date: null, effective_target_overdue: false,
  last_officer_update_at: null, days_since_officer_action: null,
};

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

let listCalls: string[] = [];
/** When true, list requests carrying high=1 return zero rows. */
let emptyWhenHigh = false;

function lastParams(): URLSearchParams {
  return new URLSearchParams(listCalls[listCalls.length - 1].split('?')[1]);
}

beforeEach(() => {
  listCalls = [];
  emptyWhenHigh = false;
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/direct-outreach?')) {
      listCalls.push(url);
      const params = new URLSearchParams(url.split('?')[1]);
      const cases = emptyWhenHigh && params.get('high') === '1' ? [] : [caseRow];
      return jsonRes({ cases, truncated: false });
    }
    if (url === '/api/direct-outreach') return jsonRes(summaryPayload);
    return jsonRes({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderDashboard() {
  render(<DirectOutreachDashboard />);
  await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));
  await screen.findByText('John Doe');
}

describe('tabs', () => {
  it('defaults to Cases: table visible, Overview content hidden, default sort params sent', async () => {
    await renderDashboard();

    expect(screen.getByRole('tab', { name: 'Cases' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByText('Agency scorecards')).not.toBeInTheDocument();

    const p = lastParams();
    expect(p.get('view')).toBe('list');
    expect(p.get('sort')).toBe('officer_update');
    expect(p.get('sort_dir')).toBe('desc');
  });

  it('Overview shows the scorecard table + officer workload and hides the cases table; Cases restores it', async () => {
    await renderDashboard();

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Agency scorecards')).toBeInTheDocument();
    // Every scorecard metric stays reachable, incl. BOTH staleness counts.
    const scorecards = screen.getByText('Agency scorecards').closest('.card-premium') as HTMLElement;
    for (const col of ['Open', 'Unassigned', 'Stale (OP >60d)', 'Officer stale', 'Overdue', 'Resolved', 'Resolution %']) {
      expect(within(scorecards).getByRole('columnheader', { name: col })).toBeInTheDocument();
    }
    expect(screen.getByText('Officer workload')).toBeInTheDocument();
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Cases' }));
    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(screen.queryByText('Agency scorecards')).not.toBeInTheDocument();
  });

  it('supports arrow-key navigation between tabs', async () => {
    await renderDashboard();

    const casesTab = screen.getByRole('tab', { name: 'Cases' });
    casesTab.focus();
    fireEvent.keyDown(casesTab.closest('[role="tablist"]')!, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(casesTab.closest('[role="tablist"]')!, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Cases' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('stat strip → filter param mapping', () => {
  it('Open backlog toggles officers=unassigned (same sentinel as the old KPI card)', async () => {
    await renderDashboard();

    const stat = screen.getByRole('button', { name: /Open backlog/ });
    fireEvent.click(stat);
    await waitFor(() => expect(lastParams().get('officers')).toBe('unassigned'));
    expect(stat).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(stat);
    await waitFor(() => expect(lastParams().get('officers')).toBeNull());
    expect(stat).toHaveAttribute('aria-pressed', 'false');
  });

  it('Needs officer action toggles stale=1', async () => {
    await renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: /Needs officer action/ }));
    await waitFor(() => expect(lastParams().get('stale')).toBe('1'));
    fireEvent.click(screen.getByRole('button', { name: /Needs officer action/ }));
    await waitFor(() => expect(lastParams().get('stale')).toBeNull());
  });

  it('Officer overdue stat toggles officer_overdue=1', async () => {
    await renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: /Officer overdue: 2/ }));
    await waitFor(() => expect(lastParams().get('officer_overdue')).toBe('1'));
  });

  it('Resolution rate has no backing filter and is NOT clickable', async () => {
    await renderDashboard();

    expect(screen.queryByRole('button', { name: /Resolution rate/ })).not.toBeInTheDocument();
    expect(screen.getByText('Resolution rate')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});

describe('filter chips + More filters', () => {
  it.each([
    ['Needs action', 'stale'],
    ['Assigned to me', 'mine'],
    ['High priority', 'high'],
  ])('default chip "%s" toggles %s=1 and reflects aria-pressed', async (label, param) => {
    await renderDashboard();

    const chip = screen.getByRole('button', { name: label });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    await waitFor(() => expect(lastParams().get(param)).toBe('1'));
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(chip);
    await waitFor(() => expect(lastParams().get(param)).toBeNull());
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it.each([
    ['Officer overdue', 'officer_overdue'],
    ['OP stalled >60d', 'stalled60'],
    ['OP stalled >90d', 'stalled90'],
    ['Has target date', 'target'],
    ['Overdue', 'overdue'],
  ])('"More filters" pill "%s" still toggles %s=1', async (label, param) => {
    await renderDashboard();

    expect(screen.getByRole('button', { name: 'More filters' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(lastParams().get(param)).toBe('1'));
  });

  it('keeps every relocated multi-select filter reachable under More filters', async () => {
    await renderDashboard();

    for (const label of ['Agency', 'Status', 'Theme', 'Outreach', 'Region', 'Officer', 'Progress']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('clicking a chip while Overview is active switches back to Cases', async () => {
    await renderDashboard();

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'High priority' }));
    expect(screen.getByRole('tab', { name: 'Cases' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(lastParams().get('high')).toBe('1'));
  });
});

describe('sort control', () => {
  it('is a native select defaulting to the current default sort (Most neglected)', async () => {
    await renderDashboard();

    const select = screen.getByRole('combobox', { name: 'Sort cases' }) as HTMLSelectElement;
    expect(select.value).toBe('officer_update');
    expect(screen.getByRole('option', { name: 'Most neglected' })).toBeInTheDocument();

    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual([
      'Most neglected', 'OP idle', 'Latest update', 'Target date',
      'Case #', 'Agency', 'Status', 'Theme / Issue', 'Officer',
    ]);
  });

  it.each([
    ['days_idle', 'desc'],
    ['latest_update_date', 'desc'],
    ['target_date', 'desc'],
    ['case_id', 'asc'],
    ['agency', 'asc'],
    ['status', 'asc'],
    ['theme', 'asc'],
    ['assignee', 'asc'],
  ])('selecting %s sends sort=%s with its legacy initial direction (%s)', async (field, dir) => {
    await renderDashboard();

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort cases' }), { target: { value: field } });
    await waitFor(() => {
      const p = lastParams();
      expect(p.get('sort')).toBe(field);
      expect(p.get('sort_dir')).toBe(dir);
    });
  });
});

describe('zero-result empty state', () => {
  it('distinguishes filtered-empty from empty, and Clear filters resets to default params', async () => {
    emptyWhenHigh = true;
    await renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'High priority' }));
    expect(await screen.findByText('No cases match the current filters')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(lastParams().get('high')).toBeNull());
    expect(await screen.findByText('John Doe')).toBeInTheDocument();
  });
});

describe('overview drill-down', () => {
  it('officer workload row click filters to that officer and returns to Cases', async () => {
    await renderDashboard();

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    fireEvent.click(screen.getByText('Alice Persaud'));
    expect(screen.getByRole('tab', { name: 'Cases' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(lastParams().get('officers')).toBe('off-1'));
  });
});
