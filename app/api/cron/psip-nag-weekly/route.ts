import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { fetchMissingTenders, groupByAgency } from '@/lib/psip/nag/missing';
import { loadSettings, loadFocalPoints, runWeeklyForAgency, markResolvedForAgency, type WeeklyOutcome } from '@/lib/psip/nag/send';

export const dynamic = 'force-dynamic';

function verifyCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  return header.length === cronSecret.length && header === cronSecret;
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return runWeekly();
}

// Allow manual invocation from a DG-only endpoint in a future pass.
// Current: POST mirrors GET so an authorized ad-hoc call also works.
export async function POST(request: NextRequest) {
  if (!verifyCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return runWeekly();
}

async function runWeekly(): Promise<NextResponse> {
  const now = new Date();
  try {
    const [settings, focals, missing] = await Promise.all([
      loadSettings(),
      loadFocalPoints(),
      fetchMissingTenders(),
    ]);

    const byAgency = groupByAgency(missing);
    const stillMissingByAgency = new Map<string, Set<string>>();
    for (const [a, list] of byAgency) {
      stillMissingByAgency.set(a, new Set(list.map((t) => t.id)));
    }

    const outcomes: WeeklyOutcome[] = [];
    for (const [agency, tenders] of byAgency) {
      outcomes.push(await runWeeklyForAgency({
        agency,
        tenders,
        focal: focals.get(agency),
        settings,
        now,
      }));
    }

    // Resolution pass: for every agency with nag records, mark resolved the
    // tenders that are no longer missing. Run this across all focal-points
    // agencies, not just ones with a current digest, so an empty-digest
    // agency still closes out old records.
    let resolvedTotal = 0;
    for (const agency of focals.keys()) {
      const stillMissing = stillMissingByAgency.get(agency) ?? new Set<string>();
      resolvedTotal += await markResolvedForAgency(agency, stillMissing);
    }

    return NextResponse.json({
      ran_at: now.toISOString(),
      emails_enabled: settings.emails_enabled,
      bcc_to_dg: settings.bcc_to_dg,
      total_missing_tenders: missing.length,
      agencies_considered: byAgency.size,
      resolved_nag_records: resolvedTotal,
      outcomes,
    });
  } catch (err) {
    logger.error({ err }, 'psip-nag-weekly cron failed');
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
