import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { upsertGoogleCalendarToken } from '@/lib/integration-tokens';
import { invalidateCalendarClientCache } from '@/lib/google-calendar';

function getRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'http://localhost:3000';
  return `${base}/api/integrations/google/callback`;
}

function adminRedirect(request: NextRequest, params: string): NextResponse {
  const base = new URL('/', request.url).origin;
  return NextResponse.redirect(`${base}/admin?${params}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Google returned an error (user denied, etc.)
  if (error) {
    return adminRedirect(request, `google=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return adminRedirect(request, 'google=error&reason=missing_params');
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const storedState = cookieStore.get('google-oauth-state')?.value;

  if (!storedState || storedState !== state) {
    return adminRedirect(request, 'google=error&reason=state_mismatch');
  }

  // Clear state cookie
  cookieStore.set('google-oauth-state', '', { maxAge: 0, path: '/' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return adminRedirect(request, 'google=error&reason=missing_credentials');
  }

  const redirectUri = getRedirectUri();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return adminRedirect(request, 'google=error&reason=no_refresh_token');
    }

    // Fetch user email for display
    oauth2Client.setCredentials(tokens);
    let accountEmail: string | undefined;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      accountEmail = userInfo.data.email || undefined;
    } catch {
      // Non-critical — proceed without email
    }

    // Store in database
    await upsertGoogleCalendarToken({
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token || undefined,
      token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : undefined,
      calendar_id: process.env.GOOGLE_CALENDAR_ID || 'primary',
      account_email: accountEmail,
      scopes: tokens.scope || undefined,
    });

    // Invalidate cached calendar client so it picks up the new token
    invalidateCalendarClientCache();

    return adminRedirect(request, 'google=connected');
  } catch (err) {
    console.error('[Google OAuth Callback] Error:', err);
    const reason = err instanceof Error ? err.message : 'unknown';
    return adminRedirect(request, `google=error&reason=${encodeURIComponent(reason)}`);
  }
}
