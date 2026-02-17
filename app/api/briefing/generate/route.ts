import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { GET as getActions } from '../actions/route';
import { GET as getCalendar } from '../calendar/route';
import { GET as getMeetings } from '../meetings/route';

const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You are the AI briefing assistant for the Director General of the Ministry of Public Utilities and Aviation, Guyana. You produce a concise, direct morning briefing. The DG oversees 7 agencies: GPL (power), GWI (water), CJIA (airport), GCAA (civil aviation), MARAD (maritime), HECI (hinterland electrification), and HAS (hinterland airstrips).

Rules:
- Be direct and sharp. No fluff, no pleasantries.
- Lead with the most urgent items: overdue high-priority actions, stale items that need escalation.
- Flag specific people who owe deliverables and how long they've been late.
- For today's meetings, note which ones have related open action items that should be raised.
- Identify cross-agency patterns or systemic issues.
- Keep it under 200 words. Three paragraphs max.
- Use names and specifics, not generalities.`;

// --- Cache: 30 min, keyed by date ---
const briefingCache = new Map<string, { data: BriefingResponse; expiry: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

interface BriefingResponse {
  briefing: string;
  generatedAt: string;
  model: string;
}

// --- Fetch data from sibling routes ---

async function fetchSourceData() {
  const [actionsRes, calendarRes, meetingsRes] = await Promise.all([
    getActions().then(r => r.json()),
    getCalendar().then(r => r.json()),
    getMeetings().then(r => r.json()),
  ]);
  return { actions: actionsRes, calendar: calendarRes, meetings: meetingsRes };
}

// --- Build structured prompt from data ---

function buildUserMessage(data: { actions: any; calendar: any; meetings: any }): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Guyana',
  });

  const parts: string[] = [`# Morning Briefing Data — ${today}\n`];

  // Actions summary
  const a = data.actions;
  if (a.summary) {
    parts.push(`## Action Items`);
    parts.push(`Open: ${a.summary.totalOpen} | Overdue: ${a.summary.totalOverdue} | Stale (7+ days untouched): ${a.summary.totalStale}`);
    if (a.summary.criticalAgencies?.length) {
      parts.push(`Critical agencies: ${a.summary.criticalAgencies.join(', ')}`);
    }
  }

  if (a.overdue?.length) {
    parts.push(`\n### Overdue Actions (${a.overdue.length})`);
    for (const item of a.overdue.slice(0, 10)) {
      parts.push(`- "${item.title}" [${item.agency || 'unassigned'}] — ${item.overdueDays}d overdue, priority: ${item.priority || 'none'}, assignee: ${item.assignee || 'unassigned'}${item.sourceMeeting ? `, from: ${item.sourceMeeting}` : ''}`);
    }
  }

  if (a.dueToday?.length) {
    parts.push(`\n### Due Today (${a.dueToday.length})`);
    for (const item of a.dueToday) {
      parts.push(`- "${item.title}" [${item.agency || 'unassigned'}] — assignee: ${item.assignee || 'unassigned'}, priority: ${item.priority || 'none'}`);
    }
  }

  if (a.stale?.length) {
    parts.push(`\n### Stale Actions — no updates for 7+ days (${a.stale.length})`);
    for (const item of a.stale.slice(0, 8)) {
      parts.push(`- "${item.title}" [${item.agency || 'unassigned'}] — ${item.staleDays}d since last edit, assignee: ${item.assignee || 'unassigned'}`);
    }
  }

  if (a.agencyPulse?.length) {
    parts.push(`\n### Agency Health`);
    for (const ag of a.agencyPulse) {
      parts.push(`- ${ag.agency}: ${ag.openCount} open, ${ag.overdueCount} overdue, ${ag.staleCount} stale (health: ${Math.round(ag.healthRatio * 100)}%)`);
    }
  }

  // Calendar
  const cal = data.calendar;
  if (cal.today?.length) {
    parts.push(`\n## Today's Calendar (${cal.today.length} events)`);
    for (const ev of cal.today) {
      const attendeeStr = ev.attendees?.length ? ` — with: ${ev.attendees.slice(0, 5).join(', ')}` : '';
      parts.push(`- ${ev.start} ${ev.summary}${ev.agency ? ` [${ev.agency}]` : ''}${ev.location ? ` @ ${ev.location}` : ''}${attendeeStr}`);
    }
  } else {
    parts.push(`\n## Today's Calendar\nNo events scheduled.`);
  }

  if (cal.upcoming?.length) {
    parts.push(`\n## Upcoming (next 5 business days)`);
    for (const ev of cal.upcoming.slice(0, 8)) {
      parts.push(`- ${ev.start} ${ev.summary}${ev.agency ? ` [${ev.agency}]` : ''}`);
    }
  }

  if (cal.authRequired) {
    parts.push(`\n⚠ Calendar is disconnected — events could not be loaded.`);
  }

  // Meetings
  const m = data.meetings;
  if (m.meetings?.length) {
    parts.push(`\n## Recent Meeting Notes (last 7 days)`);
    for (const mtg of m.meetings) {
      parts.push(`- ${mtg.date || 'no date'}: "${mtg.title}"${mtg.category ? ` [${mtg.category}]` : ''}${mtg.relatedAgency ? ` — ${mtg.relatedAgency}` : ''}`);
      if (mtg.summary) parts.push(`  Summary: ${mtg.summary}`);
    }
  }

  parts.push(`\nGenerate the DG's morning briefing based on this data.`);
  return parts.join('\n');
}

// --- Fallback briefing when Claude API fails ---

function buildFallbackBriefing(data: { actions: any; calendar: any; meetings: any }): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = data.actions;
  const cal = data.calendar;
  const lines: string[] = [];

  if (a.summary) {
    lines.push(`**${a.summary.totalOverdue} overdue actions** across ${a.summary.criticalAgencies?.length || 0} critical agencies (${a.summary.criticalAgencies?.join(', ') || 'none'}). ${a.summary.totalOpen} total open, ${a.summary.totalStale} stale.`);
  }

  if (a.overdue?.length) {
    const top3 = a.overdue.slice(0, 3);
    const overdueLines = top3.map((item: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
      `${item.title} (${item.agency || 'unassigned'}, ${item.overdueDays}d late${item.assignee ? `, ${item.assignee}` : ''})`
    );
    lines.push(`Top overdue: ${overdueLines.join('; ')}.`);
  }

  if (cal.today?.length) {
    lines.push(`Today: ${cal.today.length} event${cal.today.length > 1 ? 's' : ''} — ${cal.today.map((e: any) => `${e.start} ${e.summary}`).join(', ')}.`); // eslint-disable-line @typescript-eslint/no-explicit-any
  } else {
    lines.push('No calendar events today.');
  }

  if (cal.authRequired) {
    lines.push('⚠ Calendar disconnected — reconnect from admin settings.');
  }

  return lines.join('\n\n') || 'No briefing data available.';
}

// --- Route ---

export async function GET() {
  const dateKey = new Date().toISOString().slice(0, 10);
  const cached = briefingCache.get(dateKey);
  if (cached && Date.now() < cached.expiry) {
    return NextResponse.json(cached.data);
  }

  let sourceData: { actions: any; calendar: any; meetings: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    sourceData = await fetchSourceData();
  } catch (err) {
    console.error('[Briefing Generate] Failed to fetch source data:', err);
    return NextResponse.json(
      { error: 'Failed to fetch briefing data' },
      { status: 502 },
    );
  }

  const userMessage = buildUserMessage(sourceData);

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const briefing = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    const result: BriefingResponse = {
      briefing,
      generatedAt: new Date().toISOString(),
      model: MODEL,
    };

    briefingCache.set(dateKey, { data: result, expiry: Date.now() + CACHE_TTL_MS });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[Briefing Generate] Claude API failed, using fallback:', err);

    const result: BriefingResponse = {
      briefing: buildFallbackBriefing(sourceData),
      generatedAt: new Date().toISOString(),
      model: 'fallback',
    };

    // Cache fallback for 10 min (shorter so it retries sooner)
    briefingCache.set(dateKey, { data: result, expiry: Date.now() + 10 * 60 * 1000 });

    return NextResponse.json(result);
  }
}
