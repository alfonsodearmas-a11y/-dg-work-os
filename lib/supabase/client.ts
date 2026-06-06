'use client';
import { createBrowserClient } from '@supabase/ssr';

// P1 — browser-side Supabase client (anon key). Used by the Supabase-backed
// session provider (held for cutover) for onAuthStateChange + sign-in/out.
// Singleton so we don't recreate the client on every render.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let client: ReturnType<typeof createBrowserClient> | undefined;

export function getBrowserSupabase() {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
