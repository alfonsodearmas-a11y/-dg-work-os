import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-supabase';

// P3 — GET /api/auth/me: returns the reimplemented Supabase session shape, or 401.
//
// INERT in Part 1: nothing calls this yet (the Supabase-backed client provider is
// held for cutover). Reachable via the existing '/api/auth' public-path allowlist
// in middleware.ts. With no Supabase session present (NextAuth still active), this
// simply returns 401 — harmless.
//
// Note: this static segment takes routing precedence over the NextAuth
// `[...nextauth]` catch-all, and NextAuth has no `/me` endpoint, so there is no
// collision.
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user: session.user });
}
