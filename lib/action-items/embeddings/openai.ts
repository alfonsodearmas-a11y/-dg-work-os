// OpenAI used for embeddings (text-embedding-3-small, 1536-dim).
// Anthropic does not ship dedicated embeddings; OpenAI is the established
// alternative. User maintains an OpenAI account; this is the intended vendor.
// Voyage AI was considered as the Anthropic-aligned alternative and rejected
// because the OpenAI integration already exists.
import 'server-only';
import OpenAI from 'openai';

const MODEL = 'text-embedding-3-small';
const DIMS = 1536;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function embedText(text: string): Promise<number[]> {
  const c = client();
  const res = await c.embeddings.create({ model: MODEL, input: text, dimensions: DIMS });
  const vec = res.data[0]?.embedding;
  if (!vec || vec.length !== DIMS) throw new Error(`Embedding dim mismatch: got ${vec?.length}`);
  return vec;
}
