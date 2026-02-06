import Anthropic from '@anthropic-ai/sdk';

export interface ParsedEvent {
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  description?: string;
  all_day: boolean;
  attendees?: string[];
  add_google_meet: boolean;
}

const client = new Anthropic();

export async function parseNaturalLanguageEvent(input: string): Promise<ParsedEvent> {
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Parse this natural language event description into structured calendar data.

Current date: ${currentDate} (${dayOfWeek})
Current time: ${now.toLocaleTimeString('en-US', { hour12: false })}
Timezone: America/Guyana (GYT, UTC-4)

Input: "${input}"

Respond ONLY with a JSON object (no markdown, no explanation):
{
  "title": "event title",
  "start_time": "ISO 8601 datetime string",
  "end_time": "ISO 8601 datetime string",
  "location": "location or null",
  "description": "description or null",
  "all_day": false,
  "attendees": ["email@example.com"] or [],
  "add_google_meet": false
}

Rules:
- If no time specified, default to 9am-10am on the next business day
- If only start time given, default duration is 1 hour
- If "tomorrow" is mentioned, use ${new Date(now.getTime() + 86400000).toISOString().split('T')[0]}
- If "meet" or "video call" or "zoom" is mentioned, set add_google_meet to true
- Extract email addresses into attendees array
- Use ISO 8601 format with timezone offset -04:00 for all times`
    }]
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  try {
    const parsed = JSON.parse(text.trim());
    return {
      title: parsed.title || 'Untitled Event',
      start_time: parsed.start_time || '',
      end_time: parsed.end_time || '',
      location: parsed.location || undefined,
      description: parsed.description || undefined,
      all_day: parsed.all_day || false,
      attendees: Array.isArray(parsed.attendees) ? parsed.attendees : [],
      add_google_meet: parsed.add_google_meet || false,
    };
  } catch {
    // Fallback: try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || 'Untitled Event',
        start_time: parsed.start_time || '',
        end_time: parsed.end_time || '',
        location: parsed.location || undefined,
        description: parsed.description || undefined,
        all_day: parsed.all_day || false,
        attendees: Array.isArray(parsed.attendees) ? parsed.attendees : [],
        add_google_meet: parsed.add_google_meet || false,
      };
    }
    throw new Error('Failed to parse AI response into event data');
  }
}
