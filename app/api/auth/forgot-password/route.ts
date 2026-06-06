import { NextRequest, NextResponse } from 'next/server';
import { handleAuthLinkRequest } from '@/lib/auth-link-request';

// POST /api/auth/forgot-password — self-service password reset (public path).
// Generates a Supabase recovery link server-side and emails it through the
// existing Gmail pipeline. ANTI-ENUMERATION: always returns success, whether or
// not the email maps to an account.
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleAuthLinkRequest(req, 'recovery');
}
