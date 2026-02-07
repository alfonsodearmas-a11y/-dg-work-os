import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { assembleSystemContext } from '@/lib/ai/context-engine';
import { format } from 'date-fns';

// ── Rate Limiting (in-memory, per-session) ───────────────────────────────────

const rateLimits = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(sessionId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimits.get(sessionId);

  if (!entry || (now - entry.windowStart) > RATE_WINDOW_MS) {
    rateLimits.set(sessionId, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT - entry.count };
}

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) {
      rateLimits.delete(key);
    }
  }
}, RATE_WINDOW_MS);

// ── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'AI assistant not configured — ANTHROPIC_API_KEY missing' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body = await request.json();
    const {
      message,
      conversation_history = [],
      current_page = '/',
      session_id = 'anonymous',
    } = body as {
      message: string;
      conversation_history: Array<{ role: 'user' | 'assistant'; content: string }>;
      current_page: string;
      session_id?: string;
    };

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit check
    const rateCheck = checkRateLimit(session_id);
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded — max 20 messages per hour', remaining: 0 }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Assemble system context
    let systemContext: string;
    try {
      systemContext = await assembleSystemContext(current_page);
    } catch (err) {
      console.error('[ai/chat] Context assembly failed:', err);
      systemContext = `=== SYSTEM DATA PARTIALLY UNAVAILABLE ===\nContext assembly encountered errors. Some data may be missing.\nUser is on: ${current_page}`;
    }

    // Build system prompt
    const today = format(new Date(), 'EEEE, MMMM d, yyyy');
    const pageDesc = current_page === '/' ? 'Daily Briefing' : current_page;

    const systemPrompt = `You are the Director General's personal AI intelligence analyst for the Ministry of Public Utilities and Aviation in Guyana. You have access to real-time data from all agencies under the DG's oversight: GPL (power), GWI (water), CJIA (airport), GCAA (civil aviation), MARAD (maritime), HECI (hinterland electrification), and HAS (hinterland airstrips).

Your role:
- Answer any question about the data directly and specifically with numbers
- Identify patterns, anomalies, and risks the DG should know about
- Compare performance across agencies when relevant
- Provide actionable recommendations, not vague advice
- When referencing data, always cite the specific numbers
- Be concise but thorough — the DG is busy
- If asked about something not in the data, say so clearly
- Format responses with clear structure: use **bold** for key numbers, bullet points for lists
- If the question is about a specific agency, focus there but mention cross-cutting implications

The DG's priorities: infrastructure delivery, revenue collection, service quality, project execution on time and budget.

Current date: ${today}
The DG is currently viewing: ${pageDesc}

After your response, on a new line, add exactly this format with 2-3 follow-up questions the DG might want to ask:
<!-- suggestions: ["question 1", "question 2", "question 3"] -->

When you reference specific pages or dashboards that the DG should look at, use this format:
<!-- action: {"label": "View Details", "route": "/intel/gwi"} -->

${systemContext}`;

    // Build messages array (keep last 20 messages from history)
    const recentHistory = conversation_history.slice(-20);
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...recentHistory,
      { role: 'user', content: message },
    ];

    // Create Anthropic client and stream
    const anthropic = new Anthropic({ apiKey });

    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    // Convert to ReadableStream for SSE
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta') {
              const delta = event.delta;
              if ('text' in delta) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: delta.text })}\n\n`));
              }
            } else if (event.type === 'message_stop') {
              // Send final usage stats
              const finalMessage = await stream.finalMessage();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'done',
                usage: {
                  input_tokens: finalMessage.usage?.input_tokens,
                  output_tokens: finalMessage.usage?.output_tokens,
                },
                remaining: rateCheck.remaining,
              })}\n\n`));
              controller.close();
            }
          }
        } catch (err: any) {
          const errorMsg = err.message || 'Stream error';
          console.error('[ai/chat] Stream error:', errorMsg);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Rate-Limit-Remaining': String(rateCheck.remaining),
      },
    });
  } catch (err: any) {
    console.error('[ai/chat] Error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
