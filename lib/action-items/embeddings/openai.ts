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
