import { NextRequest, NextResponse } from 'next/server';
import { updateDraftActionItem } from '@/lib/recording-db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = ['title', 'description', 'assigned_to', 'deadline', 'priority', 'agency', 'reviewer_note'] as const;
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    const item = await updateDraftActionItem(id, updates as any);
    return NextResponse.json({ action_item: item });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
