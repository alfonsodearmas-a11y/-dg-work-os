#!/usr/bin/env node
// Schema-drift guard: extracts every table / table.column reference the codebase
// makes (Supabase PostgREST chains + raw SQL via lib/db-pg) and diffs each against
// a committed snapshot of the live prod schema (scripts/schema-snapshot.json).
// Exits non-zero on any reference to a table/column that does not exist, so this
// whole class of bug fails the build instead of 500ing in prod.
//
// Deliberately heuristic (no SQL/TS parser dependency): it favors precision, and
// legitimate false positives (embeds via FK hints, dynamic-table raw SQL, columns
// on tables the snapshot doesn't cover) are silenced via scripts/schema-drift-allowlist.json.
// Raw-SQL column-level coverage (alias.column) is best-effort; PostgREST and raw
// table/insert-list coverage is comprehensive.
//
// Run: node scripts/check-schema-drift.mjs   (npm run check:drift)
// Refresh snapshot from live prod: node scripts/refresh-schema-snapshot.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = JSON.parse(readFileSync(join(ROOT, 'scripts/schema-snapshot.json'), 'utf8'));
const TABLES = SNAPSHOT.tables; // { table: [col, ...] }
let ALLOW = [];
try {
  ALLOW = JSON.parse(readFileSync(join(ROOT, 'scripts/schema-drift-allowlist.json'), 'utf8')).allow || [];
} catch { /* no allowlist yet */ }

// supabase-js option-object keys (2nd arg of upsert/insert, options of select/order)
// which look like object keys but are NOT table columns.
const OPTION_KEYS = new Set([
  'onConflict', 'ignoreDuplicates', 'count', 'head', 'defaultToNull', 'returning',
  'ascending', 'nullsFirst', 'nullsLast', 'foreignTable', 'referencedTable',
]);

const DYN = 'DYNTBL'; // placeholder for ${...} interpolations in raw SQL
const SQL_NONTABLE = new Set(['set', 'select', 'values', 'distinct', 'only', 'lateral']);

// UPPER_CASE string constants that hold column lists (e.g. MEETING_COLUMNS,
// DOC_DETAIL_COLUMNS, TENDER_COLUMNS). Resolved FILE-LOCALLY first; the global
// map is a fallback used only when a constant name is globally unambiguous
// (same name defined with different values in >1 file => COLLISION => skip).
const CONSTS = {};
const COLLISION = Symbol('collision');
const CONST_RE = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
const ARR_JOIN_RE = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*\[([\s\S]*?)\]\s*\.join\s*\(/g;
const STR_LIT_RE = /(['"`])((?:\\.|(?!\1).)*)\1/g;
// Extract UPPER_CASE column-list constants: both string-literal RHS and
// `[ 'a', 'b', ... ].join(', ')` array RHS (e.g. TENDER_COLUMNS).
function extractConsts(src) {
  const out = {};
  let cm;
  CONST_RE.lastIndex = 0;
  while ((cm = CONST_RE.exec(src))) { const v = cm[2].slice(1, -1); if (!v.includes('${')) out[cm[1]] = v; }
  ARR_JOIN_RE.lastIndex = 0;
  while ((cm = ARR_JOIN_RE.exec(src))) {
    const parts = []; let sm; STR_LIT_RE.lastIndex = 0;
    while ((sm = STR_LIT_RE.exec(cm[2]))) { if (!sm[2].includes('${')) parts.push(sm[2]); }
    if (parts.length) out[cm[1]] = parts.join(', ');
  }
  return out;
}
function collectConsts(src, into) { return Object.assign(into, extractConsts(src)); }
// Resolve an UPPER const name to its column-list string, file-local first.
function resolveConst(id, fileConsts) {
  if (fileConsts[id] != null) return fileConsts[id];
  if (CONSTS[id] != null && CONSTS[id] !== COLLISION) return CONSTS[id];
  return null;
}

const hasTable = (t) => Object.prototype.hasOwnProperty.call(TABLES, t);
const hasCol = (t, c) => hasTable(t) && TABLES[t].includes(c);

function allowlisted(file, ref) {
  return ALLOW.some((a) => (!a.file || file.endsWith(a.file)) && (!a.ref || a.ref === ref));
}

const SCAN_DIRS = ['app', 'lib'];
const SKIP = /(?:node_modules|\.next|__tests__|\/scripts\/)|\.test\.|\.d\.ts$/;
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP.test(p + '/')) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(p) && !SKIP.test(p)) out.push(p);
  }
  return out;
}

// Strip block + line comments so method calls quoted in comments (e.g. an
// "earlier attempt: .upsert({...})" note) aren't parsed as real queries. The
// line-comment regex preserves `://` so URLs in string literals survive.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const findings = [];
const add = (file, kind, ref, detail) => {
  const rel = relative(ROOT, file);
  if (!allowlisted(rel, ref)) findings.push({ file: rel, kind, ref, detail });
};

// Split a string on top-level commas, respecting () {} [] nesting.
function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// Validate a single PostgREST select token against `table`.
function checkSelectToken(file, table, tok) {
  if (!tok || tok === '*') return;
  const embed = tok.match(/^(?:[\w]+:)?([\w]+)(?:!\w+)?\s*\((.*)\)$/s);
  if (embed) {
    const rel = embed[1];
    if (!hasTable(rel) && !hasCol(table, rel)) add(file, 'embed', `${table}.${rel}(...)`, 'embedded relation/table not found');
    return; // inner cols are FK-hint-sensitive; skip to avoid FPs
  }
  let col = tok.includes(':') ? tok.split(':').slice(1).join(':').trim() : tok;
  col = col.replace(/::[\w\[\] ]+$/, '').split('->')[0].trim();
  if (/^\w+\(/.test(col)) return;             // aggregate/function
  if (/^(count|null)$/i.test(col)) return;
  if (!/^[a-z_][a-z0-9_]*$/i.test(col)) return; // not a plain identifier
  if (hasTable(table) && !hasCol(table, col)) add(file, 'select', `${table}.${col}`, 'column not in select-table');
}

// Extract the top-level keys of the FIRST object literal in `argStr`.
function objectKeys(argStr) {
  const start = argStr.indexOf('{');
  if (start === -1) return [];
  let depth = 0, body = '', done = false;
  for (let i = start; i < argStr.length && !done; i++) {
    const ch = argStr[i];
    if (ch === '{') { depth++; if (depth === 1) continue; }
    else if (ch === '}') { depth--; if (depth === 0) { done = true; continue; } }
    if (depth >= 1) body += ch;
  }
  const keys = [];
  for (let part of splitTop(body)) {
    part = part.trim();
    if (!part || part.startsWith('...')) continue;
    let d = 0, colon = -1;
    for (let i = 0; i < part.length; i++) {
      const ch = part[i];
      if (ch === '(' || ch === '{' || ch === '[') d++;
      else if (ch === ')' || ch === '}' || ch === ']') d--;
      else if (ch === ':' && d === 0 && part[i + 1] !== ':' && part[i - 1] !== ':') { colon = i; break; }
    }
    let k = (colon >= 0 ? part.slice(0, colon) : part).trim().replace(/^['"]|['"]$/g, '');
    if (/^[A-Za-z_]\w*$/.test(k)) keys.push(k);
  }
  return [...new Set(keys)];
}

// Balanced-paren capture starting at the '(' index.
function captureParen(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) return src.slice(openIdx + 1, i); }
  }
  return src.slice(openIdx + 1);
}

function checkPostgrest(file, src) {
  const fileConsts = collectConsts(src, {});
  // Only from/select/insert/update/upsert are checked. Single-column filters
  // (.eq/.order/…) are intentionally NOT validated: on queries built up in a
  // variable across interleaved .from() calls the linear table-tracking below
  // mis-attributes them (false positives), and no real backlog bug was a
  // filter-column drift. Not checked either: .or()/.filter() strings, .rpc(),
  // embedded-relation inner columns, .select(<non-UPPER variable>).
  const tokenRe = /\.(from|select|insert|update|upsert)\s*\(/g;
  let m, current = null;
  while ((m = tokenRe.exec(src))) {
    const method = m[1];
    const argStr = captureParen(src, tokenRe.lastIndex - 1);
    if (method === 'from') {
      const t = argStr.match(/^\s*['"](\w+)['"]/);
      current = t ? t[1] : null;
      if (current && !hasTable(current)) add(file, 'from', current, 'table not found');
      continue;
    }
    if (!current || !hasTable(current)) continue;
    if (method === 'select') {
      let colStr = null;
      const trimmed = argStr.trim();
      const ident = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*$/);
      const lit = trimmed.match(/^(['"`])([\s\S]*?)\1/);
      if (ident) colStr = resolveConst(ident[1], fileConsts);
      else if (lit) colStr = lit[2].replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (mm, id) => { const v = resolveConst(id, fileConsts); return v != null ? v : mm; });
      if (colStr != null) for (const tok of splitTop(colStr)) { if (!tok.includes('${')) checkSelectToken(file, current, tok); }
    } else if (method === 'insert' || method === 'update' || method === 'upsert') {
      for (const k of objectKeys(argStr)) {
        if (OPTION_KEYS.has(k)) continue;
        if (!hasCol(current, k)) add(file, method, `${current}.${k}`, `column not in ${method}-table`);
      }
    }
  }
}

// ---- Raw SQL (lib/db-pg: query(), pgQuery(), client.query()) ----
function checkRawSql(file, src) {
  const callRe = /\b(?:pgQuery|query|client\.query)\s*\(\s*(`[\s\S]*?`|'[\s\S]*?'|"[\s\S]*?")/g;
  let m;
  while ((m = callRe.exec(src))) {
    const sql = m[1].slice(1, -1);
    // Replace ${...} interpolations with a placeholder token, and strip
    // single-quoted string literals so keywords inside string VALUES (e.g.
    // 'Removed from report') are not parsed as table/column references.
    const staticSql = sql.replace(/\$\{[^}]+\}/g, ` ${DYN} `).replace(/'(?:[^']|'')*'/g, "''");
    const aliasMap = {};
    const fromJoinRe = /\b(?:FROM|JOIN|INTO|UPDATE)\s+([A-Za-z_]\w*)(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?/gi;
    let f;
    while ((f = fromJoinRe.exec(staticSql))) {
      const tbl = f[1], alias = f[2];
      if (tbl === DYN) { if (alias) aliasMap[alias] = null; continue; }
      const t = tbl.toLowerCase();
      if (t === DYN.toLowerCase()) continue;
      // SQL keywords that follow FROM/UPDATE/INTO but are not tables
      // (e.g. `... DO UPDATE SET ...`, `INSERT INTO ... SELECT`).
      if (SQL_NONTABLE.has(t)) continue;
      if (!hasTable(t)) add(file, 'sql-table', t, 'raw-SQL table not found');
      if (alias && !/^(as|on|where|set|values|left|right|inner|outer|join|order|group|limit|returning|using)$/i.test(alias)) {
        aliasMap[alias] = hasTable(t) ? t : null;
      } else if (hasTable(t)) {
        aliasMap[t] = t; // allow t.col when no alias used
      }
    }
    const ins = staticSql.match(/INSERT\s+INTO\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/i);
    if (ins && hasTable(ins[1].toLowerCase())) {
      for (const c of ins[2].split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z_]\w*$/.test(x))) {
        if (!hasCol(ins[1].toLowerCase(), c)) add(file, 'sql-insert', `${ins[1].toLowerCase()}.${c}`, 'raw-SQL insert column not found');
      }
    }
    const colRe = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g;
    let c; const seen = new Set();
    while ((c = colRe.exec(staticSql))) {
      const alias = c[1], col = c[2].toLowerCase();
      if (!(alias in aliasMap)) continue;
      const t = aliasMap[alias];
      if (t === null) continue;
      const key = `${t}.${col}`;
      if (seen.has(key)) continue; seen.add(key);
      if (col === '*') continue;
      if (!hasCol(t, col)) add(file, 'sql-col', key, 'raw-SQL column not found');
    }
  }
}

const allFiles = [];
for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d);
  try { statSync(abs); } catch { continue; }
  walk(abs, allFiles);
}

// Pass 1: collect UPPER_CASE column-list constants globally, marking any name
// defined with conflicting values in >1 file as a COLLISION (skip on lookup).
for (const file of allFiles) {
  const local = extractConsts(readFileSync(file, 'utf8'));
  for (const [name, v] of Object.entries(local)) {
    if (name in CONSTS && CONSTS[name] !== v) CONSTS[name] = COLLISION;
    else if (!(name in CONSTS)) CONSTS[name] = v;
  }
}

// Pass 2: check (comments stripped so quoted method calls aren't parsed).
for (const file of allFiles) {
  const s = stripComments(readFileSync(file, 'utf8'));
  if (/supabaseAdmin|\.from\(/.test(s)) checkPostgrest(file, s);
  if (/pgQuery|\bquery\(|client\.query\(/.test(s)) checkRawSql(file, s);
}

const uniq = [];
const seen = new Set();
for (const f of findings) { const k = `${f.file}|${f.kind}|${f.ref}`; if (!seen.has(k)) { seen.add(k); uniq.push(f); } }

if (uniq.length === 0) {
  console.log(`✓ schema-drift check clean — no code reference to a nonexistent table/column (snapshot: ${Object.keys(TABLES).length} tables).`);
  process.exit(0);
}
console.error(`✗ schema-drift check FAILED — ${uniq.length} reference(s) to objects not in the live schema snapshot:\n`);
for (const f of uniq.sort((a, b) => a.file.localeCompare(b.file))) {
  console.error(`  [${f.kind}] ${f.ref}  (${f.detail})\n      ${f.file}`);
}
console.error(`\nFix the code to match the live schema, or add a justified entry to scripts/schema-drift-allowlist.json.`);
process.exit(1);
