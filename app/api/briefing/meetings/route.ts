import { NextResponse } from 'next/server';
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
  if (cache && Date.now() < cache.expiry) {
    return NextResponse.json(cache.data);
  }

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: rows, error } = await supabaseAdmin
      .from('meeting_minutes')
      .select('id, title, meeting_date, category, minutes_markdown')
      .gte('meeting_date', sevenDaysAgo.toISOString())
      .order('meeting_date', { ascending: false })
      .limit(10);

    if (error) throw error;

    const meetings: MeetingNote[] = (rows || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      date: r.meeting_date,
      category: r.category,
      summary: r.minutes_markdown?.slice(0, 200) || null,
      relatedAgency: detectAgency(r.title, r.category),
    }));

    const result: MeetingsResponse = {
      meetings,
      lastUpdated: new Date().toISOString(),
    };

    cache = { data: result, expiry: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Briefing Meetings] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
