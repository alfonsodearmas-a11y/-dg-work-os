import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { trello, buildListMapping, resolveStage } from '@/lib/trello';
import type { TenderStage } from '@/lib/trello';

/** Default board — HECI Capital Projects (Lethem folds into HECI per Q7) */
const DEFAULT_BOARD_ID = 'u9m0lBnP';

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;

  let boardId = DEFAULT_BOARD_ID;
  try {
    const body = await request.json();
    if (body?.boardId) boardId = body.boardId;
  } catch {
    // use default
  }

  try {
    const result = await syncBoard(boardId);
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err, boardId }, 'Trello sync failed');
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

export async function syncBoard(trelloBoardId: string) {
  const { data: board, error: boardErr } = await supabaseAdmin
    .from('trello_board')
    .select('id, agency, list_mapping')
    .eq('trello_board_id', trelloBoardId)
    .eq('is_active', true)
    .single();

  if (boardErr || !board) {
    throw new Error(`No active board found for trello_board_id: ${trelloBoardId}`);
  }

  let listMapping = (board.list_mapping ?? {}) as Record<string, TenderStage>;
  if (Object.keys(listMapping).length === 0) {
    const lists = await trello.getBoardLists(trelloBoardId);
    listMapping = buildListMapping(lists);
    await supabaseAdmin.from('trello_board').update({ list_mapping: listMapping }).eq('id', board.id);
  }

  const cards = await trello.getBoardCards(trelloBoardId);

  const agency = (board.agency as string)?.toUpperCase() === 'LETHEM' ? 'HECI' : (board.agency as string);

  const trelloCardIds: string[] = [];
  for (const card of cards) {
    trelloCardIds.push(card.id);
    const stage = resolveStage(card.idList, listMapping);

    // Upsert into unified `tender` with source='trello' and external_id = card id.
    await supabaseAdmin
      .from('tender')
      .upsert(
        {
          source: 'trello',
          external_id: card.id,
          description: card.name,
          agency,
          stage,
          stage_source: 'manual_override',
          remarks: card.desc || null,
          // 'trello_url' isn't a column on tender; we rely on external_id to deep-link.
        },
        { onConflict: 'source,external_id' },
      );
  }

  // Flag Trello tenders that disappeared from the board as missing (never delete).
  if (trelloCardIds.length > 0) {
    await supabaseAdmin
      .from('tender')
      .update({ missing_from_last_upload: true })
      .eq('source', 'trello')
      .eq('agency', agency)
      .not('external_id', 'in', `(${trelloCardIds.join(',')})`);
  }

  await supabaseAdmin.from('trello_board').update({ last_synced_at: new Date().toISOString() }).eq('id', board.id);

  return {
    success: true,
    synced: cards.length,
    boardId: board.id,
    lastSyncedAt: new Date().toISOString(),
  };
}
