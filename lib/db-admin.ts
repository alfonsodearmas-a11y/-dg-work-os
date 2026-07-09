import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

// Service-role Supabase client — SERVER ONLY. Split out of lib/db.ts so client
// components can never pull the admin client (or its module-init warnings) into
// the browser bundle; the 'server-only' import makes that a build-time error.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createFallbackClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a dummy client during build time when env vars aren't available
    return new Proxy({} as SupabaseClient, {
      get: () => {
        throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      }
    });
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

if (supabaseUrl && !supabaseServiceKey) {
  // eslint-disable-next-line no-console -- runs once at module init before logger may be ready
  logger.warn('SUPABASE_SERVICE_ROLE_KEY is not set — supabaseAdmin falls back to anon key (RLS will block most operations)');
}

// Server client with elevated permissions (bypasses RLS)
export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : createFallbackClient();
