import { NextRequest, NextResponse } from 'next/server';
import { approveDraftItem } from '@/lib/recording-db';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const item = await approveDraftItem(id);
    return NextResponse.json({ action_item: item });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
