'use client';
import { createBrowserClient } from '@supabase/ssr';

// P1 — browser-side Supabase client (anon key). Used by the Supabase-backed
// session provider (held for cutover) for onAuthStateChange + sign-in/out.
// Singleton so we don't recreate the client on every render.
// .trim() defends against a trailing newline in the Vercel env value: an
// untrimmed key ends up URL-encoded as ...%0A in the realtime WebSocket query
// string, which GoTrue rejects ("HTTP Authentication failed").
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();

let client: ReturnType<typeof createBrowserClient> | undefined;

export function getBrowserSupabase() {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
