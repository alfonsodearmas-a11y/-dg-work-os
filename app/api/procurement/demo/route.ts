import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ProcurementStage, ProcurementMethod } from '@/lib/procurement-types';

// ── Demo tag used to identify seeded data ────────────────────────────────
const DEMO_TAG = '[DEMO]';

// ── Seed data ────────────────────────────────────────────────────────────

interface DemoPackage {
  agency: string;
  title: string;
  description: string;
  estimated_value: number;
  procurement_method: ProcurementMethod;
  target_stage: ProcurementStage;
  days_ago_created: number;       // when the package was "created"
  stage_history_days: number[];   // days ago each transition happened (newest last)
  note?: string;
}

const DEMO_PACKAGES: DemoPackage[] = [
  // GPL — 4 packages across stages
  {
    agency: 'GPL',
    title: `${DEMO_TAG} Supply of 500kVA Distribution Transformers`,
    description: 'Procurement of 24 distribution transformers for the Demerara network upgrade programme.',
    estimated_value: 185_000_000,
    procurement_method: 'open_tender',
    target_stage: 'evaluation',
    days_ago_created: 45,
    stage_history_days: [45, 38, 28],
    note: 'Pre-bid meeting held with 6 registered suppliers.',
  },
  {
    agency: 'GPL',
    title: `${DEMO_TAG} Diesel Fuel Supply Contract Q3-Q4 2026`,
    description: 'Bulk diesel procurement for thermal generation stations — Canefield, Garden of Eden, Onverwagt.',
    estimated_value: 420_000_000,
    procurement_method: 'selective_tender',
    target_stage: 'no_objection',
    days_ago_created: 72,
    stage_history_days: [72, 65, 52, 40],
    note: 'Evaluation committee recommends Vendor B — best value for money.',
  },
  {
    agency: 'GPL',
    title: `${DEMO_TAG} IT Infrastructure Upgrade — Billing System`,
    description: 'Replacement of legacy billing software and server hardware across 5 regional offices.',
    estimated_value: 48_000_000,
    procurement_method: 'open_tender',
    target_stage: 'advertised',
    days_ago_created: 18,
    stage_history_days: [18, 12],
  },
  {
    agency: 'GPL',
    title: `${DEMO_TAG} Emergency Pole Replacement — East Demerara`,
    description: 'Sole source procurement for 200 concrete utility poles following storm damage.',
    estimated_value: 32_000_000,
    procurement_method: 'sole_source',
    target_stage: 'awarded',
    days_ago_created: 90,
    stage_history_days: [90, 85, 78, 70, 62, 55],
    note: 'Emergency authorization granted by PS.',
  },
  // GWI — 3 packages
  {
    agency: 'GWI',
    title: `${DEMO_TAG} Chlorine Supply Agreement 2026–2027`,
    description: 'Two-year supply contract for water treatment chemicals — liquid chlorine and sodium hypochlorite.',
    estimated_value: 95_000_000,
    procurement_method: 'open_tender',
    target_stage: 'pre_advertisement',
    days_ago_created: 8,
    stage_history_days: [8],
  },
  {
    agency: 'GWI',
    title: `${DEMO_TAG} Pipeline Rehabilitation — Linden Water Supply`,
    description: 'Replacement of 12km of asbestos cement pipeline with HDPE along the Linden–Soesdyke corridor.',
    estimated_value: 275_000_000,
    procurement_method: 'open_tender',
    target_stage: 'evaluation',
    days_ago_created: 55,
    stage_history_days: [55, 48, 35],
    note: 'Site visit completed. 4 bids received, all within budget.',
  },
  {
    agency: 'GWI',
    title: `${DEMO_TAG} Laboratory Equipment — Water Quality Testing`,
    description: 'Procurement of spectrophotometers, turbidity meters, and consumables for Georgetown central lab.',
    estimated_value: 22_000_000,
    procurement_method: 'request_for_quotation',
    target_stage: 'pre_advertisement',
    days_ago_created: 3,
    stage_history_days: [3],
  },
  // CJIA — 3 packages
  {
    agency: 'CJIA',
    title: `${DEMO_TAG} Baggage Handling System Maintenance Contract`,
    description: 'Annual maintenance and spare parts agreement for the BHS carousel system.',
    estimated_value: 68_000_000,
    procurement_method: 'selective_tender',
    target_stage: 'no_objection',
    days_ago_created: 60,
    stage_history_days: [60, 53, 42, 31],
    note: 'Only two qualified vendors in the Caribbean — selective tender justified.',
  },
  {
    agency: 'CJIA',
    title: `${DEMO_TAG} Terminal Expansion — Retail Concession Fitout`,
    description: 'Construction works for 8 new retail units in the arrivals hall expansion area.',
    estimated_value: 145_000_000,
    procurement_method: 'open_tender',
    target_stage: 'advertised',
    days_ago_created: 38,
    stage_history_days: [38, 32, 20],
  },
  {
    agency: 'CJIA',
    title: `${DEMO_TAG} Runway Lighting Replacement — LED Upgrade`,
    description: 'Replacement of halogen approach and runway edge lights with LED fixtures (ICAO compliant).',
    estimated_value: 112_000_000,
    procurement_method: 'open_tender',
    target_stage: 'pre_advertisement',
    days_ago_created: 42,
    stage_history_days: [42],
    note: 'Specifications reviewed by GCAA — approved for tender.',
  },
  // GCAA — 2 packages
  {
    agency: 'GCAA',
    title: `${DEMO_TAG} ATC Radar Software Licence Renewal`,
    description: 'Multi-year licence and support agreement for the THALES air traffic control radar system.',
    estimated_value: 56_000_000,
    procurement_method: 'sole_source',
    target_stage: 'evaluation',
    days_ago_created: 65,
    stage_history_days: [65, 58, 44],
    note: 'Sole source justified — THALES is the OEM with no alternative vendor.',
  },
  {
    agency: 'GCAA',
    title: `${DEMO_TAG} Office Furniture and Fitout — New Regulatory Wing`,
    description: 'Desks, chairs, conference tables, and partition walls for the new GCAA regulatory office.',
    estimated_value: 15_000_000,
    procurement_method: 'request_for_quotation',
    target_stage: 'pre_advertisement',
    days_ago_created: 5,
    stage_history_days: [5],
  },
];

// Stage order for building history
const STAGES: ProcurementStage[] = ['pre_advertisement', 'advertised', 'evaluation', 'no_objection', 'awarded'];

// ── POST — Seed demo data ────────────────────────────────────────────────

export async function POST() {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const userId = session.user.id;

  try {
    // Check if demo data already exists
    const { count } = await supabaseAdmin
      .from('procurement_packages')
      .select('id', { count: 'exact', head: true })
      .like('title', `${DEMO_TAG}%`);

    if (count && count > 0) {
      return NextResponse.json({ error: 'Demo data already exists. Erase it first.' }, { status: 409 });
    }

    let seeded = 0;

    for (const demo of DEMO_PACKAGES) {
      const targetIdx = STAGES.indexOf(demo.target_stage);
      const now = Date.now();

      // Insert the package
      const { data: pkg, error: pkgError } = await supabaseAdmin
        .from('procurement_packages')
        .insert({
          title: demo.title,
          description: demo.description,
          estimated_value: demo.estimated_value,
          procurement_method: demo.procurement_method,
          agency: demo.agency,
          submitted_by: userId,
          current_stage: demo.target_stage,
          created_at: new Date(now - demo.days_ago_created * 86400000).toISOString(),
        })
        .select('id')
        .single();

      if (pkgError || !pkg) {
        logger.error({ err: pkgError, title: demo.title }, 'procurement-demo: failed to seed package');
        continue;
      }

      // Build stage history — initial entry plus each transition
      const historyRows: {
        package_id: string;
        from_stage: ProcurementStage | null;
        to_stage: ProcurementStage;
        changed_by: string;
        changed_at: string;
        notes: string | null;
      }[] = [];

      // Initial entry
      historyRows.push({
        package_id: pkg.id,
        from_stage: null,
        to_stage: 'pre_advertisement',
        changed_by: userId,
        changed_at: new Date(now - demo.days_ago_created * 86400000).toISOString(),
        notes: null,
      });

      // Subsequent transitions
      for (let i = 0; i < demo.stage_history_days.length && i < targetIdx; i++) {
        const daysAgo = demo.stage_history_days[i];
        historyRows.push({
          package_id: pkg.id,
          from_stage: STAGES[i],
          to_stage: STAGES[i + 1],
          changed_by: userId,
          changed_at: new Date(now - daysAgo * 86400000).toISOString(),
          notes: null,
        });
      }

      await supabaseAdmin.from('procurement_stage_history').insert(historyRows);

      // Add note if provided
      if (demo.note) {
        await supabaseAdmin.from('procurement_notes').insert({
          package_id: pkg.id,
          content: demo.note,
          created_by: userId,
          created_at: new Date(now - (demo.days_ago_created - 1) * 86400000).toISOString(),
        });
      }

      seeded++;
    }

    return NextResponse.json({ seeded, message: `Seeded ${seeded} demo tenders` });
  } catch (err) {
    logger.error({ err }, 'procurement-demo: error seeding demo data');
    return NextResponse.json({ error: 'Failed to seed demo data' }, { status: 500 });
  }
}

// ── DELETE — Erase demo data ─────────────────────────────────────────────

export async function DELETE() {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;

  try {
    // Find all demo packages
    const { data: demoPkgs } = await supabaseAdmin
      .from('procurement_packages')
      .select('id')
      .like('title', `${DEMO_TAG}%`);

    if (!demoPkgs || demoPkgs.length === 0) {
      return NextResponse.json({ erased: 0, message: 'No demo data found' });
    }

    const ids = demoPkgs.map((p) => p.id as string);

    // Clean up storage files for demo documents
    const { data: docs } = await supabaseAdmin
      .from('procurement_documents')
      .select('file_path')
      .in('package_id', ids);

    const paths = (docs || []).map((d) => d.file_path as string).filter(Boolean);
    if (paths.length > 0) {
      await supabaseAdmin.storage.from('procurement-documents').remove(paths);
    }

    // Delete packages — cascades to history, notes, documents via FK
    const { error } = await supabaseAdmin
      .from('procurement_packages')
      .delete()
      .in('id', ids);

    if (error) throw error;

    return NextResponse.json({ erased: ids.length, message: `Erased ${ids.length} demo tenders` });
  } catch (err) {
    logger.error({ err }, 'procurement-demo: error erasing demo data');
    return NextResponse.json({ error: 'Failed to erase demo data' }, { status: 500 });
  }
}
