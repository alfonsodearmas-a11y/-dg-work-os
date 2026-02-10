import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/invite-tokens';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 400 });
    }

    const result = await verifyToken(token);

    if (!result.ok) {
      return NextResponse.json({ valid: false, reason: result.reason });
    }

    return NextResponse.json({
      valid: true,
      type: result.data.token.type,
      user: {
        full_name: result.data.user.full_name,
        role: result.data.user.role,
        agency: result.data.user.agency,
      },
    });
  } catch (error: any) {
    console.error('[auth/verify-token] Error:', error.message);
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 500 });
  }
}
