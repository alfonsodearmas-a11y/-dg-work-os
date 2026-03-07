import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getProjectNotes, addProjectNote } from '@/lib/project-queries';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const notes = await getProjectNotes(id);
    return NextResponse.json(notes);
  } catch (error) {
    console.error('Project notes error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const { note_text, note_type } = await request.json();

    if (!note_text?.trim()) {
      return NextResponse.json({ error: 'Note text is required' }, { status: 400 });
    }

    const note = await addProjectNote(id, authResult.session.user.id, note_text.trim(), note_type || 'general');
    return NextResponse.json(note);
  } catch (error) {
    console.error('Add note error:', error);
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
  }
}
