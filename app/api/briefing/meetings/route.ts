import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import Anthropic from '@anthropic-ai/sdk';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const MEETINGS_DB_ID = '270be6a94ad98039ac2cf18ddd037663';

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

// --- In-memory cache (5 min TTL) ---
let cache: { data: MeetingsResponse; expiry: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// --- Types ---

interface MeetingNote {
  id: string;
  title: string;
  date: string | null;
  category: string | null;
  summary: string | null;
  relatedAgency: string | null;
  url: string;
}

interface MeetingsResponse {
  meetings: MeetingNote[];
  lastUpdated: string;
}

// --- Helpers ---

function getPlainText(prop: any): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!prop) return null;
  if (prop.type === 'title') return prop.title?.map((t: any) => t.plain_text).join('') || null; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (prop.type === 'rich_text') return prop.rich_text?.map((t: any) => t.plain_text).join('') || null; // eslint-disable-line @typescript-eslint/no-explicit-any
  return null;
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

function parseMeeting(page: any): MeetingNote { // eslint-disable-line @typescript-eslint/no-explicit-any
  const props = page.properties;

  const title = getPlainText(props['Name']) || getPlainText(props['Title']) || 'Untitled';
  const date = props['Date']?.date?.start || null;
  const category = props['Category']?.select?.name || null;
  const summary = getPlainText(props['Summary']) || null;

  return {
    id: page.id,
    title,
    date,
    category,
    summary,
    relatedAgency: detectAgency(title, category),
    url: page.url,
  };
}

// --- AI title generation for untitled meetings ---

async function generateTitles(meetings: MeetingNote[]): Promise<void> {
  const untitled = meetings.filter(m => m.title === 'Untitled' && m.summary);
  if (untitled.length === 0) return;

  try {
    const anthropic = new Anthropic();
    const prompt = untitled.map((m, i) =>
      `${i + 1}. [${m.date || 'no date'}]${m.category ? ` [${m.category}]` : ''} ${m.summary}`
    ).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Generate a concise, descriptive title (3-7 words) for each meeting note below. The titles should read like executive agenda items — direct, specific, no fluff. Return ONLY the titles, one per line, numbered to match.\n\n${prompt}`,
      }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const lines = text.trim().split('\n').map(l => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);

    untitled.forEach((m, i) => {
      if (lines[i]) {
        m.title = lines[i];
        m.relatedAgency = detectAgency(m.title, m.category) || m.relatedAgency;
      }
    });
  } catch (err) {
    console.error('[Briefing Meetings] Title generation failed, keeping "Untitled":', err);
  }
}

// --- Route ---

export async function GET() {
  if (cache && Date.now() < cache.expiry) {
    return NextResponse.json(cache.data);
  }

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sinceDate = sevenDaysAgo.toISOString().slice(0, 10);

    const response: any = await notion.databases.query({ // eslint-disable-line @typescript-eslint/no-explicit-any
      database_id: MEETINGS_DB_ID,
      filter: {
        property: 'Date',
        date: { on_or_after: sinceDate },
      },
      sorts: [{ property: 'Date', direction: 'descending' }],
      page_size: 10,
    });

    const meetings = response.results.map(parseMeeting);
    await generateTitles(meetings);

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
