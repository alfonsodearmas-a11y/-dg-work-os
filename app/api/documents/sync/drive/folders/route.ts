import { NextRequest, NextResponse } from 'next/server';
import { listDriveFolders, setFolderId, clearFolderId } from '@/lib/google-drive';
import { requireRole } from '@/lib/auth-helpers';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

/** GET — List folders in the user's Drive (for picker) */
export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  // TODO: migrate to requireRole() — remove redundant auth() call; requireRole() above already authenticates
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || undefined;

    const folders = await listDriveFolders(session.user.id, query);
    return NextResponse.json({ folders });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list Drive folders');
    const message = error instanceof Error ? error.message : 'Failed to list folders';
    if (message.includes('token') || message.includes('OAuth') || message.includes('reconnect')) {
      return NextResponse.json({ error: message, authError: true }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — Save selected folder / DELETE body to disconnect */
export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  // TODO: migrate to requireRole() — remove redundant auth() call; requireRole() above already authenticates
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (body.action === 'disconnect') {
      await clearFolderId(session.user.id);
      return NextResponse.json({ ok: true });
    }

    const { folderId, folderName } = body;
    if (!folderId || !folderName) {
      return NextResponse.json({ error: 'folderId and folderName required' }, { status: 400 });
    }

    await setFolderId(session.user.id, folderId, folderName);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to save Drive folder');
    return NextResponse.json({ error: 'Failed to save folder' }, { status: 500 });
  }
}
