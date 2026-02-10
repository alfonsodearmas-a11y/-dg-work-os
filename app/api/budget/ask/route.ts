import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildAskContext } from '@/lib/budget-db';

const SYSTEM_PROMPT = `You are the senior budget analyst preparing the Honourable Minister of Public Utilities & Aviation for parliamentary committee defence of Guyana's 2026 Budget Estimates.

Produce a crisp, executive-style defence brief. Structure EVERY response exactly as follows:

## Executive Summary
One paragraph (3-4 sentences max) giving the key number, what it funds, why it's justified, and the single strongest talking point.

## The Numbers
A clean table or bullet list showing relevant figures with year-over-year trends. Cite source pages.

## What This Funds
Concise explanation of what the allocation covers.

## Key Justifications
Bullet points (3-5 max) with the strongest arguments.

## Anticipated Questions & Rebuttals
Format as Q/A pairs. 2-3 tough opposition questions with rebuttals.

---
Rules:
- Convert all G$'000 amounts to readable format: "G$X.XXB" for billions, "G$X.XXM" for millions
- Cite sources inline: (V1p342), (GPL Budget Justification), etc.
- Agency 34 is NEW for 2026 — prior-year zeros are expected due to restructuring.
- Be direct and confident. Keep response under 800 words.`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const question = (body.question || '').trim();

  if (!question) {
    return new Response(JSON.stringify({ error: 'question required' }), {
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

  const context = buildAskContext(question);
  const userMsg = `Minister's question: **${question}**\n\nRelevant budget data:\n${context}`;

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
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
