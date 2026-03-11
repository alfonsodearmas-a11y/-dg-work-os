import { NextResponse } from 'next/server';
import { syncDriveFolder, getDriveSyncStatus } from '@/lib/google-drive';
import { requireRole } from '@/lib/auth-helpers';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const maxDuration = 120; // Allow up to 2 minutes for sync

export async function POST() {
  const authResult = await requireRole(['dg', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  // TODO: migrate to requireRole() — remove redundant auth() call; requireRole() above already authenticates
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const result = await syncDriveFolder(session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error, userId: session.user.id }, 'Drive sync failed');
    const message = error instanceof Error ? error.message : 'Sync failed';

    // Detect auth-related errors for the UI
    if (message.includes('token') || message.includes('OAuth') || message.includes('reconnect')) {
      return NextResponse.json(
        { error: message, authError: true },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const authResult = await requireRole(['dg', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  // TODO: migrate to requireRole() — remove redundant auth() call; requireRole() above already authenticates
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const status = await getDriveSyncStatus(session.user.id);
    return NextResponse.json(status);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get Drive sync status');
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
