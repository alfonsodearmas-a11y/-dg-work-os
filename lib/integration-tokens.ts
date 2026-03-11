import { supabaseAdmin } from './db';
import { logger } from '@/lib/logger';

const TABLE = 'integration_tokens';
const PROVIDER = 'google_calendar';

export interface GoogleCalendarToken {
  refresh_token: string;
  access_token?: string | null;
  token_expiry?: string | null;
  calendar_id?: string | null;
  account_email?: string | null;
  scopes?: string | null;
  connected_at?: string | null;
}

export interface GoogleConnectionStatus {
  connected: boolean;
  account_email?: string | null;
  calendar_id?: string | null;
  connected_at?: string | null;
}

export async function getGoogleCalendarToken(userId?: string): Promise<GoogleCalendarToken | null> {
  const uid = userId || 'dg';
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('refresh_token, access_token, token_expiry, calendar_id, account_email, scopes, connected_at')
    .eq('user_id', uid)
    .eq('provider', PROVIDER)
    .single();

  if (error || !data) {
    if (error) logger.error({ err: error, userId: uid }, 'Failed to get Google Calendar token');
    return null;
  }
  return data as GoogleCalendarToken;
}

export async function upsertGoogleCalendarToken(token: {
  refresh_token: string;
  access_token?: string;
  token_expiry?: string;
  calendar_id?: string;
  account_email?: string;
  scopes?: string;
}, userId?: string): Promise<void> {
  const uid = userId || 'dg';
  const { error } = await supabaseAdmin
    .from(TABLE)
    .upsert(
      {
        user_id: uid,
        provider: PROVIDER,
        refresh_token: token.refresh_token,
        access_token: token.access_token || null,
        token_expiry: token.token_expiry || null,
        calendar_id: token.calendar_id || null,
        account_email: token.account_email || null,
        scopes: token.scopes || null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );

  if (error) {
    logger.error({ err: error }, 'IntegrationTokens upsert failed');
    throw new Error('Failed to store Google Calendar token');
  }
}

export async function deleteGoogleCalendarToken(userId?: string): Promise<void> {
  const uid = userId || 'dg';
  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('user_id', uid)
    .eq('provider', PROVIDER);

  if (error) {
    logger.error({ err: error }, 'IntegrationTokens delete failed');
    throw new Error('Failed to delete Google Calendar token');
  }
}

export async function getGoogleConnectionStatus(userId?: string): Promise<GoogleConnectionStatus> {
  const uid = userId || 'dg';
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('account_email, calendar_id, connected_at')
    .eq('user_id', uid)
    .eq('provider', PROVIDER)
    .single();

  if (error || !data) {
    return { connected: false };
  }

  return {
    connected: true,
    account_email: data.account_email,
    calendar_id: data.calendar_id,
    connected_at: data.connected_at,
  };
}
