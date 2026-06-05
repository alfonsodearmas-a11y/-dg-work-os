import { NextRequest, NextResponse } from 'next/server';
import { handleAuthLinkRequest } from '@/lib/auth-link-request';

// POST /api/auth/magic-link — passwordless sign-in link (public path).
// Same pipeline + anti-enumeration contract as forgot-password.
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleAuthLinkRequest(req, 'magiclink');
}
