import { NextResponse } from 'next/server';

// No longer needed — sub_agency comes directly from Excel column
export async function POST() {
  return NextResponse.json({ message: 'No-op: agencies are parsed directly from Excel' });
}
