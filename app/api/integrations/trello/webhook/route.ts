import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { TrelloWebhookPayload, TenderStage } from '@/lib/trello';
import { resolveStage } from '@/lib/trello';

/**
 * HEAD /api/integrations/trello/webhook
 * Trello sends HEAD to verify the callback URL exists before activating the webhook.
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  let payload: TrelloWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action } = payload;
  if (!action?.data?.board?.id) return NextResponse.json({ ok: true });

  const boardTrelloId = action.data.board.id;

  const { data: board, error: boardErr } = await supabaseAdmin
    .from('trello_board')
    .select('id, agency, list_mapping')
    .eq('trello_board_id', boardTrelloId)
    .eq('is_active', true)
    .single();

  if (boardErr || !board) {
    logger.warn({ boardTrelloId }, 'Trello webhook: no active board found');
    return NextResponse.json({ ok: true });
  }

  const agency = (board.agency as string)?.toUpperCase() === 'LETHEM' ? 'HECI' : (board.agency as string);
  const listMapping = (board.list_mapping ?? {}) as Record<string, TenderStage>;

  try {
    switch (action.type) {
      case 'createCard':
      case 'moveCardToBoard':
        await upsertCard(agency, listMapping, action);
        break;

      case 'updateCard':
        await handleUpdateCard(agency, listMapping, action);
        break;

      case 'deleteCard':
      case 'moveCardFromBoard':
        await handleDeleteCard(action);
        break;

      default:
        break;
    }
  } catch (err) {
    logger.error({ err, actionType: action.type }, 'Trello webhook: error processing action');
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function upsertCard(
  agency: string,
  listMapping: Record<string, TenderStage>,
  action: TrelloWebhookPayload['action'],
) {
  const card = action.data.card;
  if (!card) return;
  const stage = resolveStage(card.idList, listMapping);

  const { error } = await supabaseAdmin
    .from('tender')
    .upsert(
      {
        source: 'trello',
        external_id: card.id,
        description: card.name,
        agency,
        stage,
        stage_source: 'manual_override',
        remarks: card.desc ?? null,
      },
      { onConflict: 'source,external_id' },
    );
  if (error) throw error;
}

async function handleUpdateCard(
  agency: string,
  listMapping: Record<string, TenderStage>,
  action: TrelloWebhookPayload['action'],
) {
  const card = action.data.card;
  if (!card) return;

  const stage = resolveStage(card.idList, listMapping);

  // Fetch prior stage for diff log.
  const { data: existing } = await supabaseAdmin
    .from('tender')
    .select('id, stage')
    .eq('source', 'trello')
    .eq('external_id', card.id)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from('tender')
    .upsert(
      {
        source: 'trello',
        external_id: card.id,
        description: card.name,
        agency,
        stage,
        stage_source: 'manual_override',
        remarks: card.desc ?? null,
      },
      { onConflict: 'source,external_id' },
    );
  if (error) throw error;

  // Log stage transition on the tender_field_change audit trail.
  if (existing && existing.stage !== stage) {
    await supabaseAdmin.from('tender_field_change').insert({
      tender_id: existing.id,
      field_name: 'stage',
      old_value: existing.stage,
      new_value: stage,
      upload_id: null,
      changed_by: null,
    });
  }
}

async function handleDeleteCard(action: TrelloWebhookPayload['action']) {
  const card = action.data.card;
  if (!card) return;
  // Never hard-delete; flag as missing.
  await supabaseAdmin
    .from('tender')
    .update({ missing_from_last_upload: true })
    .eq('source', 'trello')
    .eq('external_id', card.id);
}
