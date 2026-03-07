import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

// Meetings are now stored natively — no Notion dependency

const AGENCY_KEYWORDS: Record<string, string[]> = {
  GPL: ['GPL', 'Guyana Power', 'power company', 'electricity'],
  GWI: ['GWI', 'Guyana Water', 'water inc'],
  CJIA: ['CJIA', 'Cheddi Jagan', 'airport'],
  GCAA: ['GCAA', 'Civil Aviation'],
  MARAD: ['MARAD', 'Maritime'],
  HECI: ['HECI', 'Hinterland'],
  HAS: ['HAS', 'Helicopter'],
  InterEnergy: ['InterEnergy', 'Inter Energy', 'Inter-Energy'],
  PPDI: ['PPDI'],
};

let cache: { data: MeetingsResponse; expiry: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface MeetingNote {
  id: string;
  title: string;
  date: string | null;
  category: string | null;
  summary: string | null;
  relatedAgency: string | null;
}

interface MeetingsResponse {
  meetings: MeetingNote[];
  lastUpdated: string;
}

function detectAgency(title: string, category: string | null): string | null {
  const text = `${title} ${category || ''}`.toLowerCase();
  for (const [agency, keywords] of Object.entries(AGENCY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      return agency;
    }
  }
  return null;
}

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  if (cache && Date.now() < cache.expiry) {
    return NextResponse.json(cache.data);
  }

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: rows, error } = await supabaseAdmin
      .from('meetings')
      .select('id, title, date, summary')
      .gte('date', sevenDaysAgo.toISOString())
      .order('date', { ascending: false })
      .limit(10);

    if (error) throw error;

    const meetings: MeetingNote[] = (rows || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      category: null,
      summary: r.summary?.slice(0, 200) || null,
      relatedAgency: detectAgency(r.title, null),
    }));

    const result: MeetingsResponse = {
      meetings,
      lastUpdated: new Date().toISOString(),
    };

    cache = { data: result, expiry: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Briefing Meetings] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 });
  }
}
