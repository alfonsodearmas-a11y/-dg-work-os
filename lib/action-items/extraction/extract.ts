// ZDR posture: see anthropic-client.ts header. Direct Anthropic only.
import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import { anthropicClient, EXTRACTION_MODEL } from './anthropic-client';
import { getTranscript } from '@/lib/action-items/fireflies/client';
import { ExtractionToolInputZ, type ExtractedItem } from './types';
import {
  buildVirtualSystemPrompt, VIRTUAL_TOOL_SCHEMA, PROMPT_VERSION as VIRTUAL_PROMPT_VERSION,
} from '@/lib/action-items/prompts/extraction-virtual-v0.3';
import { chunkTranscriptIfNeeded } from './chunk';
import type { Modality } from '@/lib/action-items/constants';
import { logger } from '@/lib/logger';
import crypto from 'node:crypto';

export interface RunExtractionInput {
  fireflies_meeting_id: string;
  modality: Modality;             // only 'virtual' wired in v1
}

export interface RunExtractionResult {
  extraction_id: string;
  prompt_version: string;
  items_extracted: number;
}

export async function runExtraction(input: RunExtractionInput): Promise<RunExtractionResult> {
  if (input.modality !== 'virtual') {
    throw new Error(`Modality ${input.modality} not wired in v1; only 'virtual' is supported.`);
  }
  const transcript = await getTranscript(input.fireflies_meeting_id);
  if (!transcript) {
    await supabaseAdmin.from('failed_extractions').insert({
      fireflies_meeting_id: input.fireflies_meeting_id,
      failure_reason: 'transcript_unavailable',
      failure_detail: 'getTranscript returned null',
    });
    throw new Error('Transcript unavailable');
  }

  const meta = {
    date: typeof transcript.date === 'number' ? new Date(transcript.date).toISOString() : transcript.date,
    title: transcript.title ?? null,
    attendees: (transcript.attendees ?? []).map(a => ({
      name: a.name ?? a.displayName ?? null,
      email: a.email ?? null,
    })),
  };
  const sys = buildVirtualSystemPrompt(meta);
  const chunks = chunkTranscriptIfNeeded(transcript);

  const allItems: ExtractedItem[] = [];
  let totalIn = 0, totalOut = 0;
  const t0 = Date.now();
  const cli = anthropicClient();

  for (const ch of chunks) {
    const userMsg = ch.text;
    let attempts = 0;
    let parsed: { items: ExtractedItem[] } | null = null;
    let lastErr: unknown = null;
    while (attempts < 4 && !parsed) {
      try {
        const res = await cli.messages.create({
          model: EXTRACTION_MODEL,
          max_tokens: 8192,
          tools: [VIRTUAL_TOOL_SCHEMA],
          tool_choice: { type: 'tool', name: 'submit_action_items' },
          system: sys,
          messages: [{ role: 'user', content: userMsg }],
        });
        totalIn += res.usage.input_tokens;
        totalOut += res.usage.output_tokens;
        const toolUse = res.content.find(c => c.type === 'tool_use') as
          | { type: 'tool_use'; input: unknown }
          | undefined;
        if (!toolUse) throw new Error('No tool_use block in response');
        const ok = ExtractionToolInputZ.safeParse(toolUse.input);
        if (!ok.success) throw new Error(`Tool input invalid: ${ok.error.message}`);
        parsed = ok.data;
      } catch (err) {
        lastErr = err;
        attempts++;
        if (attempts < 4) await new Promise(r => setTimeout(r, [1000, 4000, 16000][attempts - 1]));
      }
    }
    if (!parsed) {
      logger.error({ err: lastErr, chunk: ch.index }, 'extraction failed after retries');
      await supabaseAdmin.from('failed_extractions').insert({
        fireflies_meeting_id: input.fireflies_meeting_id,
        failure_reason: 'claude_error',
        failure_detail: lastErr instanceof Error ? lastErr.message : String(lastErr),
      });
      throw new Error('Claude extraction failed');
    }
    allItems.push(...parsed.items);
  }

  const transcript_hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(transcript.sentences ?? []))
    .digest('hex');

  // Read user-classified values from meetings_seen so the extraction row
  // reflects what the meeting actually was, not the prompt's assumption.
  // Plan 5 eval depends on this.
  const { data: msRow } = await supabaseAdmin
    .from('meetings_seen')
    .select('detected_type, detected_modality')
    .eq('fireflies_meeting_id', input.fireflies_meeting_id)
    .maybeSingle();
  const stampedType =
    (msRow?.detected_type as 'internal' | 'agency' | 'external' | null) ?? 'internal';
  const stampedModality =
    (msRow?.detected_modality as 'virtual' | 'in_person' | 'mixed' | null) ?? input.modality;

  const { data: row, error } = await supabaseAdmin
    .from('action_item_extractions')
    .insert({
      meeting_id: input.fireflies_meeting_id,
      meeting_title: transcript.title ?? null,
      meeting_date: meta.date,
      meeting_type: stampedType,
      modality: stampedModality,
      transcript_url: transcript.transcript_url ?? null,
      transcript_hash,
      prompt_version: VIRTUAL_PROMPT_VERSION,
      model: EXTRACTION_MODEL,
      raw_response: { items: allItems },
      token_count_input: totalIn,
      token_count_output: totalOut,
      extraction_duration_ms: Date.now() - t0,
      items_extracted: allItems.length,
      review_status: 'pending',
    })
    .select('id')
    .single();
  if (error || !row) throw new Error(`Failed to insert extraction: ${error?.message ?? 'unknown'}`);

  await supabaseAdmin
    .from('meetings_seen')
    .update({ pipeline_action: 'extracted', extraction_id: row.id })
    .eq('fireflies_meeting_id', input.fireflies_meeting_id);

  return {
    extraction_id: row.id as string,
    prompt_version: VIRTUAL_PROMPT_VERSION,
    items_extracted: allItems.length,
  };
}
