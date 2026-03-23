import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { TrelloWebhookPayload, ProcurementStage } from '@/lib/trello';
import { resolveStage } from '@/lib/trello';

/**
 * HEAD /api/integrations/trello/webhook
 * Trello sends HEAD to verify the callback URL exists before activating the webhook.
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/integrations/trello/webhook
 * Receives Trello webhook events and syncs procurement_items accordingly.
 * Must be idempotent — processing the same event twice must not create duplicates.
 */
export async function POST(request: NextRequest) {
  let payload: TrelloWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action } = payload;
  if (!action?.data?.board?.id) {
    // Not a board-level action we care about
    return NextResponse.json({ ok: true });
  }

  const boardTrelloId = action.data.board.id;

  // Look up the procurement_boards record
  const { data: board, error: boardErr } = await supabaseAdmin
    .from('procurement_boards')
    .select('id, list_mapping')
    .eq('trello_board_id', boardTrelloId)
    .eq('is_active', true)
    .single();

  if (boardErr || !board) {
    logger.warn({ boardTrelloId }, 'Trello webhook: no active board found for this trello_board_id');
    return NextResponse.json({ ok: true });
  }

  const listMapping = (board.list_mapping ?? {}) as Record<string, ProcurementStage>;

  try {
    switch (action.type) {
      case 'createCard':
      case 'moveCardToBoard':
        await handleCreateCard(board.id, listMapping, action);
        break;

      case 'updateCard':
        await handleUpdateCard(board.id, listMapping, action);
        break;

      case 'deleteCard':
      case 'moveCardFromBoard':
        await handleDeleteCard(action);
        break;

      default:
        // Ignore action types we don't handle
        break;
    }
  } catch (err) {
    logger.error({ err, actionType: action.type }, 'Trello webhook: error processing action');
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCreateCard(
  boardId: string,
  listMapping: Record<string, ProcurementStage>,
  action: TrelloWebhookPayload['action'],
) {
  const card = action.data.card;
  if (!card) return;

  const stage = resolveStage(card.idList, listMapping);

  const { error } = await supabaseAdmin
    .from('procurement_items')
    .upsert(
      {
        board_id: boardId,
        trello_card_id: card.id,
        title: card.name,
        description: card.desc ?? null,
        stage,
        trello_list_id: card.idList,
        due_date: card.due ?? null,
        trello_url: card.shortUrl ?? null,
        last_activity_at: new Date().toISOString(),
      },
      { onConflict: 'trello_card_id' },
    );

  if (error) throw error;

  // Record initial stage in history
  const { data: item } = await supabaseAdmin
    .from('procurement_items')
    .select('id')
    .eq('trello_card_id', card.id)
    .single();

  if (item) {
    await supabaseAdmin.from('trello_item_stage_history').insert({
      item_id: item.id,
      from_stage: null,
      to_stage: stage,
    });
  }
}

async function handleUpdateCard(
  boardId: string,
  listMapping: Record<string, ProcurementStage>,
  action: TrelloWebhookPayload['action'],
) {
  const card = action.data.card;
  if (!card) return;

  const stage = resolveStage(card.idList, listMapping);

  const { error } = await supabaseAdmin
    .from('procurement_items')
    .upsert(
      {
        board_id: boardId,
        trello_card_id: card.id,
        title: card.name,
        description: card.desc ?? null,
        stage,
        trello_list_id: card.idList,
        due_date: card.due ?? null,
        trello_url: card.shortUrl ?? null,
        last_activity_at: new Date().toISOString(),
      },
      { onConflict: 'trello_card_id' },
    );

  if (error) throw error;

  // If the card moved between lists, record a stage transition
  const { listBefore, listAfter } = action.data;
  if (listBefore && listAfter) {
    const fromStage = resolveStage(listBefore.id, listMapping);
    const toStage = resolveStage(listAfter.id, listMapping);

    if (fromStage !== toStage) {
      const { data: item } = await supabaseAdmin
        .from('procurement_items')
        .select('id')
        .eq('trello_card_id', card.id)
        .single();

      if (item) {
        await supabaseAdmin.from('trello_item_stage_history').insert({
          item_id: item.id,
          from_stage: fromStage,
          to_stage: toStage,
        });
      }
    }
  }
}

async function handleDeleteCard(action: TrelloWebhookPayload['action']) {
  const card = action.data.card;
  if (!card) return;

  await supabaseAdmin
    .from('procurement_items')
    .delete()
    .eq('trello_card_id', card.id);
}
