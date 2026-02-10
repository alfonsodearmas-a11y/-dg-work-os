import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildAnalysisContext } from '@/lib/budget-db';

const ANALYSIS_SYSTEM_PROMPT = `You are the senior budget analyst preparing the Honourable Minister of Public Utilities & Aviation for parliamentary committee defence of Guyana's 2026 Budget Estimates.

Produce a crisp, executive-style defence brief. Structure EVERY response exactly as follows:

## Executive Summary
One paragraph (3-4 sentences max) giving the key number, what it funds, why it's justified, and the single strongest talking point. This is what the Minister reads aloud if put on the spot.

## The Numbers
A clean table or bullet list showing the 4-year trend:
- 2024 Actual → 2025 Budget → 2025 Revised → 2026 Budget
- Calculate and state the year-over-year change (% and absolute)
- Cite the source page (e.g. V1p342)

## What This Funds
Concise explanation of what the allocation covers — programmes, projects, or operations. Reference specific capital projects, documents, or KPIs from the evidence. Keep it factual and tight.

## Key Justifications
Bullet points (3-5 max) with the strongest arguments for the allocation. Each bullet should be one concrete, citable fact. Lead with the most compelling point.

## Anticipated Questions & Rebuttals
Format as Q/A pairs. Anticipate 2-3 tough opposition questions and provide sharp, evidence-backed rebuttals the Minister can use verbatim.

---

Rules:
- Convert all G$'000 amounts to readable format: use "G$X.XXB" for billions, "G$X.XXM" for millions, "G$X.XXK" for thousands
- Cite sources inline: (V1p342), (GPL Budget Justification), etc.
- Agency 34 is NEW for 2026 — functions transferred from Agency 02, 45, and 31. Prior-year zeros are expected due to restructuring, not because programmes are new. Always explain this proactively.
- Be direct and confident. No hedging. This is parliamentary defence, not academic analysis.
- Keep the total response under 800 words. The Minister needs precision, not length.`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const agencyCode = (body.agency_code || '').toUpperCase();
  const lineItem = body.line_item || '';
  const budget2026 = body.budget_2026 || 0;
  const question = body.question || '';

  if (!agencyCode || !lineItem) {
    return new Response(JSON.stringify({ error: 'agency_code and line_item required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const context = buildAnalysisContext(agencyCode, lineItem);

  const userMsg = `Defence brief for: **${lineItem}** — Agency ${agencyCode} — 2026 Budget: G$${budget2026.toLocaleString()}K

${question ? `Minister asks: ${question}` : 'Provide the standard defence brief.'}

Evidence:
${context}`;

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 16000,
          system: ANALYSIS_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
          stream: true,
        });

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
