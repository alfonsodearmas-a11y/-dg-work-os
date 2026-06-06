import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// P1 — server-side Supabase client bound to Next.js request cookies (anon key).
// Used by the reimplemented auth() (lib/auth-supabase.ts) and, at cutover, the
// new middleware. NOT wired into the live request path in Part 1.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `setAll` was called from a Server Component, where cookies are
          // read-only. Safe to ignore — the middleware refreshes the session
          // cookie on the next request.
        }
      },
    },
  });
}
