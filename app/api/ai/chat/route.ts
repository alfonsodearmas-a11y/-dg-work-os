import { NextRequest } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { format } from 'date-fns';

import { assembleRawData } from '@/lib/ai/context-engine';
import { classifyQuery } from '@/lib/ai/model-router';
import { assembleCompressedContext, contextLevelForTier } from '@/lib/ai/context-compressor';
import { getSystemPrompt } from '@/lib/ai/system-prompts';
import { getCachedResponse, cacheResponse } from '@/lib/ai/response-cache';
import { getTokenBudgetStatus, logUsage } from '@/lib/ai/token-budget';
import { compressHistory } from '@/lib/ai/history-compressor';
import { tryLocalAnswer } from '@/lib/ai/local-answers';
import { getAnthropicTools, buildActionProposal, isQueryTool, executeQueryTool } from '@/lib/ai/tools';
import { ModelTier, MODEL_IDS, MAX_TOKENS, TIER_LABELS, MetricSnapshot, ChatStreamEvent } from '@/lib/ai/types';
import { auth } from '@/lib/auth';
import { parseBody } from '@/lib/api-utils';

// ── Rate Limiting (in-memory, per-session) ───────────────────────────────────

const rateLimits = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 30;
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

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) {
      rateLimits.delete(key);
    }
  }
}, RATE_WINDOW_MS);

// ── SSE Helpers ─────────────────────────────────────────────────────────────

function sseEvent(data: ChatStreamEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function parseSuggestionsFromText(text: string): { clean: string; suggestions: string[] } {
  const match = text.match(/<!--\s*suggestions:\s*(\[[\s\S]*?\])\s*-->/);
  if (!match) return { clean: text, suggestions: [] };
  try {
    const suggestions = JSON.parse(match[1]) as string[];
    return { clean: text.replace(match[0], '').trim(), suggestions };
  } catch { return { clean: text, suggestions: [] }; }
}

function parseActionsFromText(text: string): { clean: string; actions: Array<{ label: string; route: string }> } {
  const actions: Array<{ label: string; route: string }> = [];
  let clean = text;
  const regex = /<!--\s*action:\s*(\{[^}]*?\})\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      actions.push(JSON.parse(match[1]));
      clean = clean.replace(match[0], '');
    } catch { /* skip */ }
  }
  return { clean: clean.trim(), actions };
}

// ── Route Handler ────────────────────────────────────────────────────────────

const chatSchema = z.object({
  message: z.string().min(1),
  conversation_history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).default([]),
  current_page: z.string().default('/'),
  session_id: z.string().default('dg-session'),
  force_deep: z.boolean().default(false),
  snapshot: z.any().nullable().default(null),
});

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'AI assistant not configured — ANTHROPIC_API_KEY missing' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const session = await auth();
    const userId = session?.user?.id || 'anonymous';

    const { data, error } = await parseBody(request, chatSchema);
    if (error) return error;

    const {
      message,
      conversation_history,
      current_page,
      session_id,
      force_deep,
      snapshot,
    } = data!;

    // Rate limit check
    const rateCheck = checkRateLimit(session_id);
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded — max 30 messages per hour', remaining: 0 }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 1: Try local answer (zero cost) ──

    if (snapshot && !force_deep) {
      const local = tryLocalAnswer(message, snapshot);
      if (local) {
        logUsage(session_id, 'haiku', 'local', 0, 0, 'local_answer', current_page, false, true);

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(sseEvent({
              type: 'meta', tier: 'haiku', tier_label: 'Instant', cached: false, local: true,
            })));
            controller.enqueue(encoder.encode(sseEvent({ type: 'text', text: local.text })));
            controller.enqueue(encoder.encode(sseEvent({
              type: 'done', tier: 'haiku', tier_label: 'Instant', cached: false, local: true,
              usage: { input_tokens: 0, output_tokens: 0 }, remaining: rateCheck.remaining,
            })));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }
    }

    // ── Step 2: Check response cache (zero cost) ──

    if (!force_deep) {
      const cached = await getCachedResponse(message, current_page);
      if (cached) {
        logUsage(session_id, cached.model_tier, 'cached', 0, 0, 'cached', current_page, true, false);

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(sseEvent({
              type: 'meta', tier: cached.model_tier, tier_label: TIER_LABELS[cached.model_tier],
              cached: true, local: false,
            })));
            controller.enqueue(encoder.encode(sseEvent({ type: 'text', text: cached.response_text })));

            if (cached.suggestions && cached.suggestions.length > 0) {
              controller.enqueue(encoder.encode(sseEvent({
                type: 'text',
                text: `\n<!-- suggestions: ${JSON.stringify(cached.suggestions)} -->`,
              })));
            }
            if (cached.actions && cached.actions.length > 0) {
              for (const action of cached.actions) {
                controller.enqueue(encoder.encode(sseEvent({
                  type: 'text',
                  text: `\n<!-- action: ${JSON.stringify(action)} -->`,
                })));
              }
            }

            controller.enqueue(encoder.encode(sseEvent({
              type: 'done', tier: cached.model_tier, tier_label: TIER_LABELS[cached.model_tier],
              cached: true, local: false,
              usage: { input_tokens: 0, output_tokens: 0 }, remaining: rateCheck.remaining,
            })));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }
    }

    // ── Step 3: Classify query → tier ──

    let { tier, queryType } = classifyQuery(message);

    // Force deep overrides to opus
    if (force_deep) {
      tier = 'opus';
      queryType = 'forced_deep';
    }

    // ── Step 4: Budget check → may cap tier ──

    const budget = await getTokenBudgetStatus();
    const TIER_ORDER: ModelTier[] = ['haiku', 'sonnet', 'opus'];
    const capIdx = TIER_ORDER.indexOf(budget.tier_cap);
    const tierIdx = TIER_ORDER.indexOf(tier);
    if (tierIdx > capIdx) {
      tier = budget.tier_cap;
    }

    // ── Step 5: Assemble compressed context ──

    let contextStr: string;
    try {
      const raw = await assembleRawData();
      const level = contextLevelForTier(tier);
      contextStr = assembleCompressedContext(raw, current_page, level);
    } catch (err) {
      console.error('[ai/chat] Context assembly failed:', err);
      contextStr = `=== SYSTEM DATA PARTIALLY UNAVAILABLE ===\nContext assembly encountered errors.\nUser is on: ${current_page}`;
    }

    // ── Step 6: Compress history if needed ──

    let messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    try {
      const historyWithCurrent = [
        ...conversation_history.slice(-20),
        { role: 'user' as const, content: message },
      ];
      messages = await compressHistory(historyWithCurrent, apiKey);
    } catch {
      messages = [
        ...conversation_history.slice(-6),
        { role: 'user' as const, content: message },
      ];
    }

    // ── Step 7: Build system prompt ──

    const today = format(new Date(), 'EEEE, MMMM d, yyyy');
    const pageDesc = current_page === '/' ? 'Mission Control' : current_page;
    const systemPrompt = getSystemPrompt(tier, today, pageDesc, contextStr);

    // ── Step 8: Stream with tool use loop ──

    const modelId = MODEL_IDS[tier];
    const maxTokens = MAX_TOKENS[tier];
    const anthropic = new Anthropic({ apiKey });
    const tools = tier !== 'haiku' ? getAnthropicTools() : undefined;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sseEvent({
          type: 'meta', tier, tier_label: TIER_LABELS[tier], cached: false, local: false,
        })));

        // Tool use loop: Claude may call tools, we execute and feed results back
        let apiMessages: Anthropic.MessageParam[] = messages.map(m => ({
          role: m.role,
          content: m.content,
        }));
        let toolCallCount = 0;
        const MAX_TOOL_CALLS = 8;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        try {
          while (toolCallCount <= MAX_TOOL_CALLS) {
            // Make the API call — stream text, collect tool_use blocks
            const stream = anthropic.messages.stream({
              model: modelId,
              max_tokens: maxTokens,
              system: systemPrompt,
              messages: apiMessages,
              ...(tools ? { tools } : {}),
            });

            let accumulated = '';
            let toolUseBlocks: Array<{ id: string; name: string; input: string }> = [];
            let pendingToolUse: { id: string; name: string; input: string } | null = null;

            for await (const event of stream) {
              if (event.type === 'content_block_start') {
                if (event.content_block.type === 'tool_use') {
                  pendingToolUse = {
                    id: event.content_block.id,
                    name: event.content_block.name,
                    input: '',
                  };
                }
              } else if (event.type === 'content_block_delta') {
                const delta = event.delta;
                if ('text' in delta) {
                  accumulated += delta.text;
                  controller.enqueue(encoder.encode(sseEvent({ type: 'text', text: delta.text })));
                } else if ('partial_json' in delta && pendingToolUse) {
                  pendingToolUse.input += delta.partial_json;
                }
              } else if (event.type === 'content_block_stop') {
                if (pendingToolUse) {
                  toolUseBlocks.push(pendingToolUse);
                  pendingToolUse = null;
                }
              }
            }

            const finalMessage = await stream.finalMessage();
            totalInputTokens += finalMessage.usage?.input_tokens || 0;
            totalOutputTokens += finalMessage.usage?.output_tokens || 0;

            // If no tool_use blocks, we're done
            if (toolUseBlocks.length === 0) {
              // Log usage
              logUsage(session_id, tier, modelId, totalInputTokens, totalOutputTokens, queryType, current_page, false, false);

              // Cache if no tool use happened in any turn
              if (toolCallCount === 0) {
                const { clean: c1, suggestions } = parseSuggestionsFromText(accumulated);
                const { clean: c2, actions } = parseActionsFromText(c1);
                cacheResponse(message, current_page, tier, c2, suggestions, actions, totalInputTokens, totalOutputTokens);
              }

              controller.enqueue(encoder.encode(sseEvent({
                type: 'done', tier, tier_label: TIER_LABELS[tier], cached: false, local: false,
                usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
                remaining: rateCheck.remaining,
              })));
              controller.close();
              return;
            }

            // Process tool_use blocks
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            let hasActionTool = false;

            for (const block of toolUseBlocks) {
              toolCallCount++;
              let toolInput: Record<string, unknown>;
              try {
                toolInput = JSON.parse(block.input || '{}');
              } catch {
                toolInput = {};
              }

              if (isQueryTool(block.name)) {
                // Auto-execute query tools — they're read-only
                const result = await executeQueryTool(block.name, toolInput);
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                });
              } else {
                // Action tool — send confirmation to UI, do NOT auto-execute
                hasActionTool = true;
                const proposal = buildActionProposal(block.name, toolInput);
                controller.enqueue(encoder.encode(sseEvent({
                  type: 'tool_use',
                  action: proposal,
                })));
                // Send a "declined" result back to Claude so it doesn't hang
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: 'Action proposed to user for confirmation. Do not retry. Wait for user to approve or cancel.',
                });
              }
            }

            // If we had action tools, finish the stream — user needs to confirm
            if (hasActionTool) {
              logUsage(session_id, tier, modelId, totalInputTokens, totalOutputTokens, queryType, current_page, false, false);
              controller.enqueue(encoder.encode(sseEvent({
                type: 'done', tier, tier_label: TIER_LABELS[tier], cached: false, local: false,
                usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
                remaining: rateCheck.remaining,
              })));
              controller.close();
              return;
            }

            // All tools were queries — feed results back to Claude for the next turn
            // Build the assistant message content blocks for the API
            const assistantContent: Anthropic.ContentBlockParam[] = [];
            if (accumulated) {
              assistantContent.push({ type: 'text', text: accumulated });
            }
            for (const block of toolUseBlocks) {
              let parsedInput: Record<string, unknown>;
              try { parsedInput = JSON.parse(block.input || '{}'); } catch { parsedInput = {}; }
              assistantContent.push({
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: parsedInput,
              });
            }

            apiMessages = [
              ...apiMessages,
              { role: 'assistant', content: assistantContent },
              { role: 'user', content: toolResults },
            ];

            // Reset for next iteration
            accumulated = '';
          }

          // If we hit the max tool calls limit
          controller.enqueue(encoder.encode(sseEvent({
            type: 'text', text: '\n\n*Reached maximum tool call limit for this turn.*',
          })));
          logUsage(session_id, tier, modelId, totalInputTokens, totalOutputTokens, queryType, current_page, false, false);
          controller.enqueue(encoder.encode(sseEvent({
            type: 'done', tier, tier_label: TIER_LABELS[tier], cached: false, local: false,
            usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
            remaining: rateCheck.remaining,
          })));
          controller.close();
        } catch (err: any) {
          const errorMsg = err.message || 'Stream error';
          console.error('[ai/chat] Stream error:', errorMsg);
          controller.enqueue(encoder.encode(sseEvent({ type: 'error', error: errorMsg })));
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
        'X-AI-Tier': tier,
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
