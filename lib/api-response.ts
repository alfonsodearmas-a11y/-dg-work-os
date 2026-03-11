import { NextResponse } from 'next/server';

/** Return a standardized success JSON response */
export function apiSuccess<T>(data: T, meta?: { page?: number; total?: number }): NextResponse {
  return NextResponse.json({ success: true, data, ...(meta ? { meta } : {}) });
}

/** Return a standardized error JSON response */
export function apiError(message: string, status: number, code?: string): NextResponse {
  return NextResponse.json(
    { success: false, error: { message, ...(code ? { code } : {}) } },
    { status }
  );
}
