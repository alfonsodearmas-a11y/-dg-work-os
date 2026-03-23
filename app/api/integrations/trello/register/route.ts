import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { trello, buildListMapping } from '@/lib/trello';
import { syncBoard } from '@/app/api/integrations/trello/sync/route';

/**
 * POST /api/integrations/trello/register
 * Register a Trello board for procurement sync.
 * Body: { boardId: string, agency: string }
 */
export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'ps']);
  if (authResult instanceof NextResponse) return authResult;

  let body: { boardId: string; agency: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { boardId, agency } = body;
  if (!boardId || !agency) {
    return NextResponse.json({ error: 'boardId and agency are required' }, { status: 400 });
  }

  try {
    // 1. Fetch board info from Trello
    const boardInfo = await trello.getBoard(boardId);

    // 2. Fetch lists and build stage mapping
    const lists = await trello.getBoardLists(boardId);
    const listMapping = buildListMapping(lists);

    // 3. Insert into procurement_boards
    const { data: board, error: insertErr } = await supabaseAdmin
      .from('procurement_boards')
      .insert({
        agency,
        trello_board_id: boardId,
        board_name: boardInfo.name,
        list_mapping: listMapping,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        return NextResponse.json(
          { error: 'This Trello board is already registered' },
          { status: 409 },
        );
      }
      throw insertErr;
    }

    // 4. Register Trello webhook
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const callbackUrl = `${appUrl}/api/integrations/trello/webhook`;

    let webhookId: string | null = null;
    try {
      const webhook = await trello.registerWebhook(boardId, callbackUrl);
      webhookId = webhook.id;

      await supabaseAdmin
        .from('procurement_boards')
        .update({ webhook_id: webhookId })
        .eq('id', board.id);
    } catch (err) {
      logger.warn({ err, boardId }, 'Failed to register Trello webhook — sync will still work manually');
    }

    // 5. Run initial full sync
    const syncResult = await syncBoard(boardId);

    return NextResponse.json(
      {
        success: true,
        board: { ...board, webhook_id: webhookId },
        sync: syncResult,
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error({ err, boardId }, 'Trello board registration failed');
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
