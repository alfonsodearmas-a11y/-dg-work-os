import { readFileSync } from 'node:fs';
const envText = readFileSync('.env.local', 'utf8');
for (const line of envText.split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) { let v = m[2].trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); if (!process.env[m[1]]) process.env[m[1]]=v; } }
async function main() {
  const { supabaseAdmin } = await import('../lib/db');
  const mode = process.argv[2];
  if (mode === 'promote') {
    const r = await supabaseAdmin.from('users').update({ role: 'dg', agency: null }).eq('email', 'test.heci.analyst@mpua.gov.gy');
    console.log(r);
  } else {
    await supabaseAdmin.from('users').update({ role: 'officer', agency: 'heci' }).eq('email', 'test.heci.analyst@mpua.gov.gy');
    console.log('reverted');
  }
}
main();
