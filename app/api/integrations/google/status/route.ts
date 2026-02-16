import { NextResponse } from 'next/server';
import { getGoogleConnectionStatus } from '@/lib/integration-tokens';

export async function GET() {
  try {
    const status = await getGoogleConnectionStatus();

    // Also check if env var fallback exists
    const hasEnvToken = !!process.env.GOOGLE_REFRESH_TOKEN;

    return NextResponse.json({
      ...status,
      has_env_fallback: hasEnvToken,
    });
  } catch (err) {
    console.error('[Google Status] Error:', err);
    return NextResponse.json(
      { connected: false, error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
