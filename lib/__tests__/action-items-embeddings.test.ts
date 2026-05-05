import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('openai', () => {
  const create = vi.fn(async () => ({
    data: [{ embedding: Array.from({ length: 1536 }, (_, i) => i / 1536) }],
  }));
  class OpenAI {
    embeddings = { create };
  }
  return { default: OpenAI, __mocks: { create } };
});

beforeEach(() => {
  vi.resetModules();
  process.env.OPENAI_API_KEY = 'k';
});

describe('embedText', () => {
  it('returns a 1536-dim vector', async () => {
    const { embedText } = await import('@/lib/action-items/embeddings/openai');
    const v = await embedText('approve the contract');
    expect(v).toHaveLength(1536);
  });

  it('throws when OPENAI_API_KEY missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const { embedText } = await import('@/lib/action-items/embeddings/openai');
    await expect(embedText('x')).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
