'use client';
// P6 — HELD FOR CUTOVER (step C5). NOT YET WIRED.
//
// Drop-in replacement for next-auth/react's <SessionProvider> + useSession().
// Returns the SAME { data, status } shape, so the ~14 useSession() callsites +
// ViewAsProvider become import-path swaps only.
//
// At cutover:
//   1) swap <AuthSessionProvider> → <SupabaseSessionProvider> in the app layout;
//   2) codemod the `from 'next-auth/react'` import sites to
//      `from '@/components/providers/SupabaseSessionProvider'`
//      (site list: scripts/auth-migration/README.md).
// Until then this file is imported by nothing and is inert.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import type { AuthChangeEvent } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/client';
import type { Session } from '@/lib/auth-session';

type Status = 'loading' | 'authenticated' | 'unauthenticated';
interface SessionState {
  data: Session | null;
  status: Status;
}

const SessionContext = createContext<SessionState>({ data: null, status: 'loading' });

export function SupabaseSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ data: null, status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) {
        setState({ data: null, status: 'unauthenticated' });
        return;
      }
      const body = (await res.json()) as { user: Session['user'] | null };
      setState(
        body.user
          ? { data: { user: body.user }, status: 'authenticated' }
          : { data: null, status: 'unauthenticated' },
      );
    } catch {
      setState({ data: null, status: 'unauthenticated' });
    }
  }, []);

  useEffect(() => {
    // Supabase fires INITIAL_SESSION on subscribe (with or without a session),
    // which drives the first /api/auth/me load — so we don't call setState
    // synchronously in the effect body.
    const supabase = getBrowserSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'TOKEN_REFRESHED'
      ) {
        refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo(() => state, [state]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Drop-in replacement for next-auth/react useSession() — same { data, status }. */
export function useSession(): SessionState {
  return useContext(SessionContext);
}
