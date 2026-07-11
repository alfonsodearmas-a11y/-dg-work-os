// @vitest-environment jsdom
//
// Case panel — presentation-reorg contract tests. The MultiSelect officer
// picker must invoke the EXISTING assignment handler with the IDENTICAL
// PATCH payload the old native <select> produced (and never write to the
// read-only /officers list route); unassign posts the same null sentinel;
// an officer-list fetch failure disables the picker instead of presenting
// an empty one.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CaseDetailPanel } from '@/components/direct-outreach/CaseDetailPanel';
import type { OutreachCaseDetail } from '@/lib/direct-outreach/types';

vi.mock('@/components/providers/ViewAsProvider', () => ({
  useEffectiveUser: () => ({
    effectiveUser: { id: 'user-super', name: 'Test Super', role: 'superadmin', agency: null },
  }),
}));

const baseCase: OutreachCaseDetail = {
  case_id: 7, client_name: 'John Doe', client_address: null, client_phone: null,
  agency: 'GWI', effective_agency: 'GWI', transferred: false,
  status: 'Open', priority_flag: 'Normal', theme: 'Water-Supply',
  description: 'No water', category_name: null, unclassified_category: null,
  outreach_location: null, outreach_date: null, region: null, point_person: null,
  public_servant: null, creator: null, synced_at: null, created_at: '2026-01-01',
  assignee_user_id: null, assignee_name: null, assigned_at: null, assignee_agency: null,
  latest_update: null, latest_update_date: null, latest_update_by: null,
  comment_count: 0, days_open: 10, days_idle: 5, age_bucket: '0-30 days',
  committed_date: null, committed_source: null, committed_by: null, committed_overdue: false,
  working_status: 'not_started', officer_target_date: null, officer_target_overdue: false,
  effective_target_date: null, effective_target_overdue: false,
  last_officer_update_at: null, days_since_officer_action: null,
};

const officers = [
  { id: 'off-1', name: 'Alice Persaud', role: 'agency_manager', agency: 'GWI' },
  { id: 'off-2', name: 'Bob Ministry', role: 'superadmin', agency: null },
];

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

interface CapturedWrite { url: string; init: RequestInit }
let writes: CapturedWrite[] = [];
let officersFails = false;
let caseOverrides: Partial<OutreachCaseDetail> = {};

beforeEach(() => {
  writes = [];
  officersFails = false;
  caseOverrides = {};
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, init });
      return jsonRes({});
    }
    if (url === '/api/direct-outreach/officers') {
      if (officersFails) return jsonRes({ error: 'boom' }, false, 500);
      return jsonRes({ users: officers });
    }
    if (url.startsWith('/api/tasks/users?agency=')) return jsonRes({ users: [] });
    if (url === '/api/direct-outreach/7') {
      return jsonRes({
        case: { ...baseCase, ...caseOverrides },
        updates: [], transfers: [], officer_updates: [],
        state: {
          working_status: 'not_started', target_date: null,
          updated_by: null, updated_by_name: null, updated_at: null,
        },
      });
    }
    return jsonRes({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderPanel() {
  render(<CaseDetailPanel caseId={7} onClose={() => {}} />);
  await screen.findByText('No water');
}

describe('officer picker (MultiSelect adapter)', () => {
  it('assigning posts the identical PATCH payload the old native select produced', async () => {
    await renderPanel();

    const trigger = await screen.findByRole('button', { name: 'Assign an officer…' });
    await waitFor(() => expect(trigger).not.toBeDisabled());
    fireEvent.click(trigger);

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Alice Persaud (GWI)' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].url).toBe('/api/direct-outreach/7');
    expect(writes[0].init.method).toBe('PATCH');
    expect(writes[0].init.body).toBe(JSON.stringify({ assignee_user_id: 'off-1' }));
    // The read-only officers list route must never receive a write.
    expect(writes.some((w) => w.url.includes('/officers'))).toBe(false);
  });

  it('labels agency-less superadmins with the Ministry fallback', async () => {
    await renderPanel();

    const trigger = await screen.findByRole('button', { name: 'Assign an officer…' });
    await waitFor(() => expect(trigger).not.toBeDisabled());
    fireEvent.click(trigger);

    expect(await screen.findByRole('checkbox', { name: 'Bob Ministry (Ministry)' })).toBeInTheDocument();
  });

  it('unassign posts the same null sentinel as before', async () => {
    caseOverrides = { assignee_user_id: 'off-1', assignee_name: 'Alice Persaud', assigned_at: '2026-01-02' };
    await renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Unassign officer' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].url).toBe('/api/direct-outreach/7');
    expect(writes[0].init.method).toBe('PATCH');
    expect(writes[0].init.body).toBe(JSON.stringify({ assignee_user_id: null }));
  });

  it('a failed officer fetch disables the picker and offers a retry — never an empty picker', async () => {
    officersFails = true;
    await renderPanel();

    const trigger = await screen.findByRole('button', { name: 'Assign an officer…' });
    await waitFor(() => expect(screen.getByText(/Failed to load the officer list/)).toBeInTheDocument());
    expect(trigger).toBeDisabled();

    officersFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(trigger).not.toBeDisabled());
    fireEvent.click(trigger);
    expect(await screen.findByRole('checkbox', { name: 'Alice Persaud (GWI)' })).toBeInTheDocument();
  });
});

describe('panel layout reorg', () => {
  it('renders the read-only metadata inside a collapsed "Case details" section', async () => {
    await renderPanel();

    expect(screen.getByRole('button', { name: /Case details/ })).toBeInTheDocument();
    const collapse = document.querySelector('.collapse-grid');
    expect(collapse).not.toBeNull();
    expect(collapse!.classList.contains('open')).toBe(false);
  });

  it('keeps working status, officer picker, and target date inside one action region', async () => {
    await renderPanel();

    const region = screen.getByText('Progress & commitment').closest('.card-premium')!;
    expect(region).toContainElement(screen.getByText('Responsible officer'));
    expect(region).toContainElement(screen.getByText('Officer target date'));
    expect(region).toContainElement(screen.getByRole('radiogroup', { name: 'Working status' }));
  });
});

describe('region metadata (populated column)', () => {
  it('surfaces the case region getCase now returns', async () => {
    caseOverrides = { region: 'Region 3' };
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Case details/ }));

    const field = screen.getByText('Region').parentElement!; // <p>Region</p> + value
    expect(field).toHaveTextContent('Region 3');
  });

  it('shows an em dash for a case with no derivable region', async () => {
    caseOverrides = { region: null };
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Case details/ }));

    const value = screen.getByText('Region').parentElement!.querySelector('div');
    expect(value?.textContent).toBe('—');
  });
});
