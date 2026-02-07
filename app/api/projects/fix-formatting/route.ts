import { NextResponse } from 'next/server';

// No longer needed — formatting is handled at parse time
export async function POST() {
  return NextResponse.json({ message: 'No-op: formatting is handled during Excel parsing' });
}
