import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getGoogleConnectionStatus } from '@/lib/integration-tokens';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const session = await auth(); // TODO: migrate to requireRole()
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ connected: false, error: 'Not authenticated' }, { status: 401 });

    const status = await getGoogleConnectionStatus(userId);

    return NextResponse.json(status);
  } catch (err) {
    logger.error({ err }, 'Google connection status check failed');
    return NextResponse.json(
      { connected: false, error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
