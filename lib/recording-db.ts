// Supabase CRUD for meeting recordings + draft action items

import { supabaseAdmin } from '@/lib/db';
import { createTask } from '@/lib/notion';
import { createTask as createPgTask } from '@/lib/task-queries';
import { query } from '@/lib/db-pg';
import type { RecordingAnalysis, RecordingActionItem } from '@/lib/recording-processor';
import type { TaskPriority } from '@/lib/task-queries';

// ── Types ──────────────────────────────────────────────────────────────────

export type RecordingStatus = 'recording' | 'uploading' | 'transcribing' | 'transcribed' | 'processing' | 'completed' | 'failed';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'pushed_to_notion';

export interface MeetingRecording {
  id: string;
  title: string;
  meeting_date: string | null;
  attendees: string[];
  notes: string | null;
  duration_seconds: number | null;
  recorded_at: string | null;
  agency: string | null;
  scriberr_id: string | null;
  raw_transcript: string | null;
  speaker_labels: { name: string; start: number; end: number; text: string }[];
  analysis: RecordingAnalysis | null;
  ai_model: string | null;
  ai_tokens_used: number | null;
  status: RecordingStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftActionItem {
  id: string;
  recording_id: string;
  item_index: number;
  title: string;
  description: string | null;
  assigned_to: string | null;
  deadline: string | null;
  priority: 'high' | 'medium' | 'low';
  agency: string | null;
  context: string | null;
  review_status: ReviewStatus;
  reviewer_note: string | null;
  notion_task_id: string | null;
  push_error: string | null;
  created_at: string;
  updated_at: string;
}

// ── Valid agency values ────────────────────────────────────────────────────

const VALID_AGENCIES = new Set(['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Ministry']);

function mapAgency(agency: string | null): string | null {
  if (!agency) return null;
  const upper = agency.toUpperCase();
  if (VALID_AGENCIES.has(upper)) return upper;
  if (agency.toLowerCase() === 'ministry') return 'Ministry';
  return null;
}

function mapPriority(p: string): 'High' | 'Medium' | 'Low' {
  const map: Record<string, 'High' | 'Medium' | 'Low'> = { high: 'High', medium: 'Medium', low: 'Low' };
  return map[p?.toLowerCase()] || 'Medium';
}

function mapPriorityToPg(p: string): TaskPriority {
  const map: Record<string, TaskPriority> = { high: 'high', medium: 'medium', low: 'low', critical: 'critical' };
  return map[p?.toLowerCase()] || 'medium';
}

// ── Recordings CRUD ────────────────────────────────────────────────────────

export async function createRecording(params: {
  title: string;
  meeting_date?: string | null;
  attendees?: string[];
  notes?: string | null;
  duration_seconds?: number | null;
  recorded_at?: string | null;
  agency?: string | null;
  scriberr_id?: string | null;
  status?: RecordingStatus;
}): Promise<MeetingRecording> {
  const { data, error } = await supabaseAdmin
    .from('meeting_recordings')
    .insert({
      title: params.title,
      meeting_date: params.meeting_date || null,
      attendees: params.attendees || [],
      notes: params.notes || null,
      duration_seconds: params.duration_seconds || null,
      recorded_at: params.recorded_at || null,
      agency: params.agency || null,
      scriberr_id: params.scriberr_id || null,
      status: params.status || 'uploading',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create recording: ${error.message}`);
  return data as MeetingRecording;
}

export async function getRecordingById(id: string): Promise<MeetingRecording | null> {
  const { data, error } = await supabaseAdmin
    .from('meeting_recordings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch recording: ${error.message}`);
  }
  return data as MeetingRecording;
}

export async function getRecordingByScriberrId(scriberrId: string): Promise<MeetingRecording | null> {
  const { data, error } = await supabaseAdmin
    .from('meeting_recordings')
    .select('*')
    .eq('scriberr_id', scriberrId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch recording by scriberr_id: ${error.message}`);
  }
  return data as MeetingRecording;
}

export async function getRecordingsList(filters?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ recordings: MeetingRecording[]; total: number }> {
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  let query = supabaseAdmin
    .from('meeting_recordings')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch recordings: ${error.message}`);

  return {
    recordings: (data || []) as MeetingRecording[],
    total: count || 0,
  };
}

export async function updateRecordingStatus(
  id: string,
  status: RecordingStatus,
  extra?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('meeting_recordings')
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Failed to update recording status: ${error.message}`);
}

export async function updateRecording(
  id: string,
  fields: Record<string, unknown>,
): Promise<MeetingRecording> {
  const { data, error } = await supabaseAdmin
    .from('meeting_recordings')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update recording: ${error.message}`);
  return data as MeetingRecording;
}

// ── Draft Action Items CRUD ────────────────────────────────────────────────

export async function createDraftActionItems(
  recordingId: string,
  items: RecordingActionItem[],
): Promise<DraftActionItem[]> {
  if (items.length === 0) return [];

  const rows = items.map((item, index) => ({
    recording_id: recordingId,
    item_index: index,
    title: item.title,
    description: item.description || null,
    assigned_to: item.assigned_to || null,
    deadline: item.deadline || null,
    priority: item.priority || 'medium',
    agency: item.agency || null,
    context: item.context || null,
    review_status: 'pending',
  }));

  const { data, error } = await supabaseAdmin
    .from('draft_action_items')
    .insert(rows)
    .select();

  if (error) throw new Error(`Failed to create draft action items: ${error.message}`);
  return (data || []) as DraftActionItem[];
}

export async function getDraftActionItems(recordingId: string): Promise<DraftActionItem[]> {
  const { data, error } = await supabaseAdmin
    .from('draft_action_items')
    .select('*')
    .eq('recording_id', recordingId)
    .order('item_index', { ascending: true });

  if (error) throw new Error(`Failed to fetch draft action items: ${error.message}`);
  return (data || []) as DraftActionItem[];
}

export async function updateDraftActionItem(
  id: string,
  fields: Partial<Pick<DraftActionItem, 'title' | 'description' | 'assigned_to' | 'deadline' | 'priority' | 'agency' | 'context' | 'review_status' | 'reviewer_note'>>,
): Promise<DraftActionItem> {
  const { data, error } = await supabaseAdmin
    .from('draft_action_items')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update draft action item: ${error.message}`);
  return data as DraftActionItem;
}

export async function approveDraftItem(id: string, userId?: string): Promise<DraftActionItem> {
  // Fetch the item
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from('draft_action_items')
    .select('*, meeting_recordings!inner(title, meeting_date)')
    .eq('id', id)
    .single();

  if (fetchErr) throw new Error(`Failed to fetch action item: ${fetchErr.message}`);

  const recording = (item as any).meeting_recordings;

  try {
    // Build description for Notion task
    const descLines: string[] = [];
    if (item.description) descLines.push(item.description);
    descLines.push('');
    descLines.push(`From recording: ${recording.title}`);
    if (item.assigned_to) {
      descLines.push(`Assigned to: ${item.assigned_to}`);
    }

    const task = await createTask({
      title: item.title,
      status: 'To Do',
      due_date: item.deadline || null,
      agency: mapAgency(item.agency),
      role: 'Meeting Action Item',
      priority: mapPriority(item.priority),
      description: descLines.join('\n'),
    });

    // Also create task in PostgreSQL DB
    try {
      const mappedAgency = mapAgency(item.agency);
      if (mappedAgency) {
        // Look up CEO assignee for this agency
        const ceoResult = await query(
          `SELECT id FROM users WHERE agency = $1 AND role = 'ceo' AND is_active = true LIMIT 1`,
          [mappedAgency]
        );

        if (ceoResult.rows.length > 0) {
          const assigneeId = ceoResult.rows[0].id;
          const creatorId = userId || assigneeId; // Use approver userId if available, otherwise use assignee

          await createPgTask(
            {
              title: item.title,
              description: `From meeting recording: ${item.recording_id}\n\n${item.description || item.title}`,
              priority: mapPriorityToPg(item.priority),
              agency: mappedAgency,
              assignee_id: assigneeId,
              due_date: item.deadline || null,
              source_recording_id: item.recording_id,
            },
            creatorId
          );
          console.log(`[PG Task] Created task for action item ${id} in agency ${mappedAgency}`);
        } else {
          console.warn(`[PG Task] No active CEO found for agency ${mappedAgency}, skipping PG task creation`);
        }
      } else {
        console.warn(`[PG Task] No valid agency for action item ${id}, skipping PG task creation`);
      }
    } catch (pgErr: any) {
      console.error(`[PG Task] Failed to create PostgreSQL task for action item ${id}:`, pgErr.message);
      // Don't throw - allow the approval to succeed even if PG task creation fails
    }

    // Update with success
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('draft_action_items')
      .update({
        review_status: 'pushed_to_notion',
        notion_task_id: task.notion_id,
        push_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw new Error(`Failed to update after push: ${updateErr.message}`);
    return updated as DraftActionItem;
  } catch (pushErr: any) {
    // Record error but set approved
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('draft_action_items')
      .update({
        review_status: 'approved',
        push_error: pushErr.message || 'Unknown error pushing to Notion',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw new Error(`Failed to update after push error: ${updateErr.message}`);
    return updated as DraftActionItem;
  }
}

export async function deleteRecording(id: string): Promise<void> {
  // Draft action items are cascade-deleted via FK
  const { error } = await supabaseAdmin
    .from('meeting_recordings')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete recording: ${error.message}`);
}

export async function rejectDraftItem(id: string, note?: string): Promise<DraftActionItem> {
  return updateDraftActionItem(id, {
    review_status: 'rejected',
    reviewer_note: note || null,
  });
}

export async function bulkApproveItems(ids: string[], userId?: string): Promise<{
  approved: number;
  failed: number;
  errors: string[];
}> {
  const result = { approved: 0, failed: 0, errors: [] as string[] };

  for (const id of ids) {
    try {
      const item = await approveDraftItem(id, userId);
      if (item.review_status === 'pushed_to_notion') {
        result.approved++;
      } else {
        result.failed++;
        result.errors.push(`${id}: ${item.push_error || 'Push failed'}`);
      }
    } catch (err: any) {
      result.failed++;
      result.errors.push(`${id}: ${err.message}`);
    }
  }

  return result;
}
