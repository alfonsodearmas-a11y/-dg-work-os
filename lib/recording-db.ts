// Supabase CRUD for meeting recordings + draft action items

import { supabaseAdmin } from '@/lib/db';
import { createTask } from '@/lib/notion';
import type { RecordingAnalysis, RecordingActionItem } from '@/lib/recording-processor';

// ── Types ──────────────────────────────────────────────────────────────────

export type RecordingStatus = 'uploading' | 'transcribing' | 'transcribed' | 'processing' | 'completed' | 'failed';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'pushed_to_notion';

export interface MeetingRecording {
  id: string;
  title: string;
  meeting_date: string | null;
  attendees: string[];
  notes: string | null;
  audio_file_path: string | null;
  audio_filename: string | null;
  audio_mime_type: string | null;
  audio_file_size: number | null;
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

// ── Recordings CRUD ────────────────────────────────────────────────────────

export async function createRecording(params: {
  title: string;
  meeting_date?: string | null;
  attendees?: string[];
  notes?: string | null;
  audio_file_path?: string | null;
  audio_filename?: string | null;
  audio_mime_type?: string | null;
  audio_file_size?: number | null;
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
      audio_file_path: params.audio_file_path || null,
      audio_filename: params.audio_filename || null,
      audio_mime_type: params.audio_mime_type || null,
      audio_file_size: params.audio_file_size || null,
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
  fields: Partial<Pick<DraftActionItem, 'title' | 'description' | 'assigned_to' | 'deadline' | 'priority' | 'agency' | 'review_status' | 'reviewer_note'>>,
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

export async function approveDraftItem(id: string): Promise<DraftActionItem> {
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

export async function rejectDraftItem(id: string, note?: string): Promise<DraftActionItem> {
  return updateDraftActionItem(id, {
    review_status: 'rejected',
    reviewer_note: note || null,
  });
}

export async function bulkApproveItems(ids: string[]): Promise<{
  approved: number;
  failed: number;
  errors: string[];
}> {
  const result = { approved: 0, failed: 0, errors: [] as string[] };

  for (const id of ids) {
    try {
      const item = await approveDraftItem(id);
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
