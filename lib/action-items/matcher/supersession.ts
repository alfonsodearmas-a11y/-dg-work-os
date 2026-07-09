import 'server-only';
import { supabaseAdmin } from '@/lib/db-admin';

export interface SupersessionCandidate {
  task_id: string;
  title: string;
  created_at: string;
  score: number;
}

export function extractNounPhrases(text: string): string[] {
  // Capitalized 1–3 word sequences. Drop sentence-initial first word.
  const words = text.split(/\s+/);
  const out: string[] = [];
  let buf: string[] = [];
  let firstSkipped = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[^A-Za-z'-]/g, '');
    const isCap = /^[A-Z]/.test(w);
    if (isCap) {
      if (!firstSkipped && i === 0) { firstSkipped = true; continue; }
      buf.push(w);
      if (buf.length === 3) { out.push(buf.join(' ').toLowerCase()); buf = []; }
    } else {
      if (buf.length > 0) { out.push(buf.join(' ').toLowerCase()); buf = []; }
    }
  }
  if (buf.length > 0) out.push(buf.join(' ').toLowerCase());
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  return intersect / (a.size + b.size - intersect);
}

export function scoreCombined({ cosine, jaccard: j, verbMatch }: { cosine: number; jaccard: number; verbMatch: boolean }): number {
  return 0.5 * cosine + 0.3 * j + 0.2 * (verbMatch ? 1 : 0);
}

export interface FindOpts {
  limit?: number;
  threshold?: number;
  windowDays?: number;
}

export async function findSupersessionCandidates(
  task: { id: string; owner_user_id: string; title: string; verb_category: string | null; task_embedding: number[] | null },
  opts: FindOpts = {},
): Promise<SupersessionCandidate[]> {
  const limit = opts.limit ?? 3;
  const threshold = opts.threshold ?? 0.75;
  const windowDays = opts.windowDays ?? 60;
  if (!task.task_embedding) return [];

  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabaseAdmin
    .from('tasks')
    .select('id, title, verb_category, task_embedding, created_at')
    .eq('owner_user_id', task.owner_user_id)
    .neq('id', task.id)
    .in('status', ['new', 'active', 'blocked', 'awaiting_verification'])
    .gte('created_at', cutoff)
    .not('task_embedding', 'is', null)
    .limit(50);

  const ourPhrases = new Set(extractNounPhrases(task.title));
  const ourEmbed = task.task_embedding;

  const out: SupersessionCandidate[] = [];
  for (const r of rows ?? []) {
    const cand = r.task_embedding as unknown as number[] | null;
    if (!cand) continue;
    const cos = cosineSim(ourEmbed, cand);
    const j = jaccard(ourPhrases, new Set(extractNounPhrases(r.title as string)));
    const verbMatch = task.verb_category != null && task.verb_category === r.verb_category;
    const score = scoreCombined({ cosine: cos, jaccard: j, verbMatch });
    if (score >= threshold) {
      out.push({ task_id: r.id as string, title: r.title as string, created_at: r.created_at as string, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
