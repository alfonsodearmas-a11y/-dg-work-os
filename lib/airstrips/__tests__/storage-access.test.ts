import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

// Static guard: airstrip photos are served ONLY through the auth-gated proxy route.
// No code may construct a raw public storage URL or mint a Supabase signed URL.

const ROOTS = ['app/airstrips', 'app/api/airstrips', 'components/airstrips', 'lib/airstrips'];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== '__tests__') walk(p, acc);     // skip test files (they hold the patterns)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(p);
    }
  }
  return acc;
}

const files = ROOTS.flatMap(r => walk(path.join(process.cwd(), r)));

describe('airstrip storage access is proxy-only', () => {
  it('scans a non-trivial number of airstrip source files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no code constructs a raw /object/public/airstrip-photos/ URL', () => {
    const offenders = files.filter(f => readFileSync(f, 'utf8').includes('object/public/airstrip-photos'));
    expect(offenders).toEqual([]);
  });

  it('no code mints a Supabase signed URL (createSignedUrl) for airstrip photos', () => {
    const offenders = files.filter(f => readFileSync(f, 'utf8').includes('createSignedUrl'));
    expect(offenders).toEqual([]);
  });
});
