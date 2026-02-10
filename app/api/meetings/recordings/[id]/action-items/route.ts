import { NextRequest, NextResponse } from 'next/server';
import { getDraftActionItems } from '@/lib/recording-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const items = await getDraftActionItems(id);
    return NextResponse.json({ action_items: items });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
