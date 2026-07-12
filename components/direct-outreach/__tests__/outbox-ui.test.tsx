// @vitest-environment jsdom

// OP Direct outbox panel — counts, rows, and the Retry/Skip triage actions.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OutboxPanel } from '@/components/direct-outreach/OutboxPanel';
import type { OutreachOutboxRow, OutreachOutboxSummary } from '@/lib/direct-outreach/types';

const PENDING_ID = '11111111-2222-4333-8444-555555555555';
const FAILED_ID = '99999999-2222-4333-8444-555555555555';

const row = (over: Partial<OutreachOutboxRow>): OutreachOutboxRow => ({
  id: PENDING_ID,
  case_id: 58244,
  source_kind: 'status',
  dgos_ref: `DGOS-${PENDING_ID}`,
  comment_text: 'Status -> Resolved — pending verification',
  op_status_target: 'Resolved',
  author_label: 'Officer One',
  status: 'pending',
  opdirect_comment_id: null,
  attempts: 0,
  last_error: null,
  posted_at: null,
  created_at: '2026-07-11T12:00:00Z',
  ...over,
});

const payload: OutreachOutboxSummary = {
  counts: { pending: 1, posted: 3, skipped: 0, failed: 1 },
  rows: [
    row({}),
    row({
      id: FAILED_ID,
      case_id: 58199,
      source_kind: 'remark',
      dgos_ref: `DGOS-${FAILED_ID}`,
      comment_text: 'Crew on site',
      op_status_target: null,
      status: 'failed',
      attempts: 2,
      last_error: 'Save button not found',
    }),
  ],
};

type CapturedWrite = { url: string; init?: RequestInit };
let writes: CapturedWrite[] = [];

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  writes = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, init });
      return jsonRes({ ok: true });
    }
    if (url.includes('/api/direct-outreach/outbox')) return jsonRes(payload);
    return jsonRes({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OutboxPanel', () => {
  it('renders counts, rows, refs, and the OP status target', async () => {
    render(<OutboxPanel />);
    await screen.findByText('#58244');
    expect(screen.getByText('#58199')).toBeInTheDocument();
    expect(screen.getByText(`DGOS-${PENDING_ID}`)).toBeInTheDocument();
    expect(screen.getByText('→ Resolved')).toBeInTheDocument();
    expect(screen.getByText('Save button not found')).toBeInTheDocument(); // failed row surfaces last_error
    expect(screen.getAllByText('Officer One', { selector: 'td' })).toHaveLength(2);
  });

  it('Skip appears only on pending rows and POSTs to /skip', async () => {
    render(<OutboxPanel />);
    await screen.findByText('#58244');
    const skip = screen.getByRole('button', { name: 'Skip' });
    fireEvent.click(skip);
    await waitFor(() =>
      expect(writes.map((w) => w.url)).toContain(`/api/direct-outreach/outbox/${PENDING_ID}/skip`),
    );
  });

  it('Retry appears only on failed/skipped rows and POSTs to /retry', async () => {
    render(<OutboxPanel />);
    await screen.findByText('#58244');
    const retry = screen.getByRole('button', { name: /Retry/ });
    fireEvent.click(retry);
    await waitFor(() =>
      expect(writes.map((w) => w.url)).toContain(`/api/direct-outreach/outbox/${FAILED_ID}/retry`),
    );
  });

  it('empty outbox renders the empty state', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () =>
      jsonRes({ counts: { pending: 0, posted: 0, skipped: 0, failed: 0 }, rows: [] }),
    );
    render(<OutboxPanel />);
    await screen.findByText('Outbox is empty');
  });
});
