#!/usr/bin/env node

/**
 * Seed script: Parse Oversight_Project_Listings.xlsx and upsert into Supabase.
 *
 * Usage:
 *   node scripts/seed-projects.js [path-to-xlsx]
 *
 * Defaults to ~/Desktop/Oversight Project Listings.xlsx
 */

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars. Check .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MONTHS = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function parseDateDMY(value) {
  if (!value || value === '-') return null;
  const str = String(value).trim();
  const match = str.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i);
  if (match) {
    const day = match[1].padStart(2, '0');
    const mon = MONTHS[match[2].toUpperCase()];
    const year = match[3];
    if (mon) return `${year}-${mon}-${day}`;
  }
  return null;
}

function parseCurrency(value) {
  if (value === null || value === undefined || value === '-' || value === '') return null;
  if (typeof value === 'number') return value;
  const str = String(value);
  // Multi-value cells: "$89,290,200,\r\n\r\n$985,498,500" — split on newlines, sum all
  const parts = str.split(/[\r\n]+/).filter(s => s.trim());
  let total = 0;
  let found = false;
  for (const part of parts) {
    const cleaned = part.replace(/[$,\s]/g, '');
    if (!cleaned) continue;
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      total += num;
      found = true;
    }
  }
  return found ? total : null;
}

function parsePercent(value) {
  if (value === null || value === undefined || value === '-' || value === '') return 0;
  if (typeof value === 'number') {
    if (value > 0 && value <= 1) return Math.round(value * 100);
    return Math.round(value);
  }
  const num = parseFloat(String(value).replace('%', '').trim());
  if (isNaN(num)) return 0;
  if (num > 0 && num <= 1) return Math.round(num * 100);
  return Math.round(num);
}

function clean(value) {
  if (value === null || value === undefined || value === '-' || value === '') return null;
  return String(value).trim() || null;
}

async function main() {
  const filePath = process.argv[2] || path.join(process.env.HOME, 'Desktop', 'Oversight Project Listings.xlsx');

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Reading: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('project')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  console.log(`Sheet: ${sheetName}, Rows: ${rows.length}`);

  const projects = [];
  const agencies = {};
  let totalValue = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const projectId = clean(r[0]);
    if (!projectId) continue;

    const subAgency = clean(r[2]) || 'MOPUA';
    const contractValue = parseCurrency(r[5]);

    projects.push({
      project_id: projectId,
      executing_agency: clean(r[1]),
      sub_agency: subAgency,
      project_name: String(r[3] || '').trim(),
      region: clean(r[4]),
      contract_value: contractValue,
      contractor: clean(r[6]),
      project_end_date: parseDateDMY(r[7]),
      completion_pct: parsePercent(r[8]),
      has_images: parseInt(String(r[9] || '0'), 10) || 0,
      updated_at: new Date().toISOString(),
    });

    agencies[subAgency] = (agencies[subAgency] || 0) + 1;
    if (contractValue) totalValue += contractValue;
  }

  console.log(`\nParsed ${projects.length} projects:`);
  console.log(`  Agencies:`, agencies);
  console.log(`  Total value: $${(totalValue / 1e9).toFixed(1)}B`);

  // Upsert in batches of 50
  const batchSize = 50;
  let upserted = 0;

  for (let i = 0; i < projects.length; i += batchSize) {
    const batch = projects.slice(i, i + batchSize);
    const { error } = await supabase
      .from('projects')
      .upsert(batch, { onConflict: 'project_id', ignoreDuplicates: false });

    if (error) {
      console.error(`Batch ${i}-${i + batch.length} error:`, error.message);
      // If table doesn't exist, show migration hint
      if (error.message.includes('does not exist') || error.message.includes('column')) {
        console.error('\nRun the migration first:');
        console.error('  Copy supabase/migrations/002_projects_v2.sql into Supabase SQL Editor and execute it.');
        process.exit(1);
      }
    } else {
      upserted += batch.length;
      process.stdout.write(`  Upserted ${upserted}/${projects.length}\r`);
    }
  }

  // Record upload
  await supabase.from('project_uploads').insert({
    filename: path.basename(filePath),
    project_count: projects.length,
  });

  console.log(`\nDone! ${upserted} projects seeded.`);
}

main().catch(err => { console.error(err); process.exit(1); });
