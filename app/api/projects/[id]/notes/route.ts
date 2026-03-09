import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, apiError } from '@/lib/api-utils';
import { getProjectNotes, addProjectNote } from '@/lib/project-queries';
import { logger } from '@/lib/logger';

const addNoteSchema = z.object({
  note_text: z.string().min(1),
  note_type: z.enum(['general', 'escalation', 'status_update']).optional(),
});

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
    logger.error({ err: error }, 'Project notes error');
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, addNoteSchema);
  if (error) return error;

  try {
    const { id } = await params;
    const note = await addProjectNote(id, authResult.session.user.id, data.note_text.trim(), data.note_type || 'general');
    return NextResponse.json(note);
  } catch (err) {
    logger.error({ err }, 'Add note error');
    return apiError('ADD_NOTE_FAILED', 'Failed to add note', 500);
  }
}
