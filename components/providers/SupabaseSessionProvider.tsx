'use client';
// Supabase Auth session provider — the app's live session context. Returns the
// same { data, status } shape the former next-auth useSession() did, so the
// useSession() call-sites are import-path swaps. Wrapped by AuthSessionProvider
// (components/providers/SessionProvider.tsx) in the app layout; hydrates from
// /api/auth/me and refreshes on Supabase auth state changes.
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
