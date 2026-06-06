'use client';

import { SupabaseSessionProvider } from './SupabaseSessionProvider';

// Auth provider for the app. Supabase Auth owns sessions; this wraps the tree in
// the Supabase-backed session context (drop-in for the former next-auth provider).
// Kept under the AuthSessionProvider name so app/layout.tsx is unchanged.
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SupabaseSessionProvider>{children}</SupabaseSessionProvider>;
}
