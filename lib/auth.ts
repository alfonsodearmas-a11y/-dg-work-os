import { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { supabaseAdmin } from './db';

export type Role = 'dg' | 'minister' | 'ps' | 'agency_admin' | 'officer';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
      role: Role;
      agency: string | null;
    };
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    userId: string;
    role: Role;
    agency: string | null;
  }
}

const allowedDomains = (process.env.ALLOWED_GOOGLE_DOMAINS || '')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // NOTE: Upgraded from calendar.readonly to calendar.events to support creating events.
          // Existing users must sign out and sign back in to grant the new write permission.
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.events',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ profile, account }) {
      if (!profile?.email) return false;

      // Domain check
      const domain = profile.email.split('@')[1]?.toLowerCase();
      if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
        return '/403';
      }

      const googleSub = profile.sub;
      if (!googleSub) return false;

      const now = new Date().toISOString();
      let userId: string;

      // 1. Check by google_sub (returning user)
      const { data: existingBySub } = await supabaseAdmin
        .from('users')
        .select('id, is_active, status, login_count')
        .eq('google_sub', googleSub)
        .single();

      if (existingBySub) {
        if (!existingBySub.is_active) return '/403';
        userId = existingBySub.id;
        await supabaseAdmin
          .from('users')
          .update({
            email: profile.email,
            name: profile.name || null,
            avatar_url: profile.picture || null,
            last_login: now,
            last_seen_at: now,
            login_count: (existingBySub.login_count ?? 0) + 1,
          })
          .eq('id', userId);
      } else {
        // 2. Check by email (invited user, first sign-in)
        const { data: existingByEmail } = await supabaseAdmin
          .from('users')
          .select('id, is_active, status, first_login_at, login_count')
          .eq('email', profile.email)
          .single();

        if (!existingByEmail) {
          // Email not in whitelist — deny access
          return '/403';
        }

        if (!existingByEmail.is_active && existingByEmail.status !== 'pending') {
          // Deactivated user — deny access
          return '/403';
        }

        // First sign-in for invited user, or re-sign-in for active user without google_sub
        userId = existingByEmail.id;
        await supabaseAdmin
          .from('users')
          .update({
            google_sub: googleSub,
            name: profile.name || null,
            avatar_url: profile.picture || null,
            is_active: true,
            status: 'active',
            first_login_at: existingByEmail.first_login_at || now,
            last_login: now,
            last_seen_at: now,
            login_count: (existingByEmail.login_count ?? 0) + 1,
          })
          .eq('id', userId);
      }

      // Store refresh token for calendar access (keyed by user UUID)
      if (account?.refresh_token && userId) {
        await supabaseAdmin
          .from('integration_tokens')
          .upsert(
            {
              user_id: userId,
              provider: 'google_calendar',
              refresh_token: account.refresh_token,
              access_token: account.access_token || null,
              token_expiry: account.expires_at
                ? new Date(account.expires_at * 1000).toISOString()
                : null,
              account_email: profile.email,
              scopes: (account.scope as string) || null,
            },
            { onConflict: 'user_id,provider' }
          );
      }

      return true;
    },

    async jwt({ token, account, profile }) {
      // On initial sign-in, load user from DB
      if (account && profile?.sub) {
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('id, role, agency')
          .eq('google_sub', profile.sub)
          .single();

        if (user) {
          token.userId = user.id;
          token.role = user.role as Role;
          token.agency = user.agency;
        }
      }

      // Refresh role/agency on every token refresh (catches admin changes)
      if (token.userId && !account) {
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('role, agency, is_active')
          .eq('id', token.userId)
          .single();

        if (user && user.is_active) {
          token.role = user.role as Role;
          token.agency = user.agency;
        } else {
          // User was deactivated — clear token so middleware redirects to /403
          token.userId = '';
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.agency = token.agency;
      }
      return session;
    },
  },
});

// ── Backward-compatible shims for old admin/tm routes ──────────────────
// These bridge the old JWT-based auth API to NextAuth sessions.
// Phase 4 will convert each route to use requireRole() directly.

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

interface LegacyUser {
  id: string;
  email: string;
  name: string;
  fullName: string;
  full_name: string;
  role: string;
  agency: string | null;
}

async function getSessionUser(): Promise<LegacyUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError('Authentication required', 401);
  }
  const name = session.user.name || '';
  return {
    id: session.user.id,
    email: session.user.email,
    name,
    fullName: name,
    full_name: name,
    role: session.user.role,
    agency: session.user.agency,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function authenticateRequest(_request: NextRequest): Promise<LegacyUser> {
  return getSessionUser();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function authenticateAny(_request: NextRequest): Promise<LegacyUser> {
  return getSessionUser();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function authenticateFromCookie(_request: NextRequest): Promise<LegacyUser> {
  return getSessionUser();
}

export function isDG(user: LegacyUser): boolean {
  return user.role === 'dg';
}

export function isCEO(user: LegacyUser): boolean {
  return user.role === 'dg';
}

export function canAccessTask(user: LegacyUser, task: { assignee_id?: string; created_by?: string; agency?: string }): boolean {
  if (['dg', 'minister', 'ps'].includes(user.role)) return true;
  if (task.assignee_id === user.id || task.created_by === user.id) return true;
  if (user.role === 'agency_admin' && task.agency && user.agency === task.agency) return true;
  return false;
}

export function authorizeRoles(user: LegacyUser, ...roles: string[]): void {
  // Map old role names to new ones
  const roleMap: Record<string, string[]> = {
    director: ['dg'],
    admin: ['dg', 'agency_admin'],
    officer: ['officer'],
    minister: ['minister'],
    ps: ['ps'],
  };

  const allowedNewRoles = roles.flatMap(r => roleMap[r] || [r]);
  if (!allowedNewRoles.includes(user.role)) {
    throw new AuthError('Insufficient permissions', 403);
  }
}
