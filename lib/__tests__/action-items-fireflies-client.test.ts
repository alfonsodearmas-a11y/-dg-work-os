import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  process.env.FIREFLIES_API_KEY = 'test-key';
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => { cb(); return 0 as unknown as ReturnType<typeof setTimeout>; }) as typeof setTimeout);
});

describe('listRecentTranscripts', () => {
  it('returns parsed transcripts on success', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ data: { transcripts: [
        { id: 't1', title: 'Mgmt Call', date: '2026-04-13T10:00:00Z',
          source: 'Google Meet', meeting_attendees: [{ email: 'a@mpua.gov.gy' }] },
      ] } }),
    });
    const { listRecentTranscripts } = await import('@/lib/action-items/fireflies/client');
    const out = await listRecentTranscripts(new Date('2026-04-13'));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('t1');
  });

  it('retries 3x on 500 then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 502, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 200, json: async () => ({ data: { transcripts: [] } }) });
    const { listRecentTranscripts } = await import('@/lib/action-items/fireflies/client');
    const out = await listRecentTranscripts(new Date());
    expect(out).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('throws after retries exhausted', async () => {
    mockFetch.mockResolvedValue({ status: 500, json: async () => ({}) });
    const { listRecentTranscripts, FirefliesError } = await import('@/lib/action-items/fireflies/client');
    await expect(listRecentTranscripts(new Date())).rejects.toBeInstanceOf(FirefliesError);
  });

  it('throws when API key missing', async () => {
    delete process.env.FIREFLIES_API_KEY;
    const { listRecentTranscripts } = await import('@/lib/action-items/fireflies/client');
    await expect(listRecentTranscripts(new Date())).rejects.toThrow(/API_KEY/);
  });
});
