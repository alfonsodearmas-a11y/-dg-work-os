import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { trello, buildListMapping, resolveStage } from '@/lib/trello';
import type { ProcurementStage } from '@/lib/trello';

/** Default board — HECI Capital Projects */
const DEFAULT_BOARD_ID = 'u9m0lBnP';

/**
 * POST /api/integrations/trello/sync
 * Full sync: fetches all cards from Trello, upserts items, removes orphans.
 * Body is optional. Defaults to HECI board if no boardId provided.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;

  let boardId = DEFAULT_BOARD_ID;
  try {
    const body = await request.json();
    if (body?.boardId) boardId = body.boardId;
  } catch {
    // No body or invalid JSON — use default
  }

  try {
    const result = await syncBoard(boardId);
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err, boardId }, 'Trello sync failed');
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

/**
 * Core sync logic.
 */
export async function syncBoard(trelloBoardId: string) {
  // 1. Look up the board record
  const { data: board, error: boardErr } = await supabaseAdmin
    .from('procurement_boards')
    .select('id, list_mapping')
    .eq('trello_board_id', trelloBoardId)
    .eq('is_active', true)
    .single();

  if (boardErr || !board) {
    throw new Error(`No active board found for trello_board_id: ${trelloBoardId}`);
  }

  // 2. Fetch lists from Trello and rebuild list_mapping if empty
  let listMapping = (board.list_mapping ?? {}) as Record<string, ProcurementStage>;
  if (Object.keys(listMapping).length === 0) {
    const lists = await trello.getBoardLists(trelloBoardId);
    listMapping = buildListMapping(lists);
    await supabaseAdmin
      .from('procurement_boards')
      .update({ list_mapping: listMapping })
      .eq('id', board.id);
  }

  // 3. Fetch all cards from Trello
  const cards = await trello.getBoardCards(trelloBoardId);

  // 4. Upsert each card
  const trelloCardIds: string[] = [];
  for (const card of cards) {
    trelloCardIds.push(card.id);
    const stage = resolveStage(card.idList, listMapping);

    await supabaseAdmin
      .from('procurement_items')
      .upsert(
        {
          board_id: board.id,
          trello_card_id: card.id,
          title: card.name,
          description: card.desc || null,
          stage,
          trello_list_id: card.idList,
          due_date: card.due ?? null,
          labels: card.labels ?? [],
          attachments_count: card.attachments?.length ?? 0,
          trello_url: card.shortUrl,
          last_activity_at: card.dateLastActivity,
        },
        { onConflict: 'trello_card_id' },
      );
  }

  // 5. Delete orphaned items (cards removed from Trello while webhook was down)
  if (trelloCardIds.length > 0) {
    await supabaseAdmin
      .from('procurement_items')
      .delete()
      .eq('board_id', board.id)
      .not('trello_card_id', 'in', `(${trelloCardIds.join(',')})`);
  } else {
    await supabaseAdmin
      .from('procurement_items')
      .delete()
      .eq('board_id', board.id);
  }

  // 6. Update last_synced_at
  await supabaseAdmin
    .from('procurement_boards')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', board.id);

  return {
    success: true,
    synced: cards.length,
    boardId: board.id,
    lastSyncedAt: new Date().toISOString(),
  };
}
