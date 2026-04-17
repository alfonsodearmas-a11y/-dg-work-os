// Ensure the two storage buckets used by the new procurement module exist.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim())),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('missing env'); process.exit(2); }

const admin = createClient(url, key, { auth: { persistSession: false } });

for (const name of ['tender-documents', 'psip-uploads']) {
  const { data: existing } = await admin.storage.getBucket(name);
  if (existing) {
    console.log(`${name}: already exists`);
    continue;
  }
  const { error } = await admin.storage.createBucket(name, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (error) {
    console.error(`${name}: FAILED — ${error.message}`);
    process.exit(1);
  }
  console.log(`${name}: created`);
}

console.log('\nDone.');
