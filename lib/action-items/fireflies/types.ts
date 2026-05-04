import { z } from 'zod';

export const FirefliesAttendeeZ = z.object({
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
});

export const FirefliesMeetingInfoZ = z.object({
  // Fireflies summary lifecycle: processing | processed | failed.
  // Replaces the older `transcript_status` field which doesn't exist on this
  // tenant's GraphQL schema. We treat 'processed' as ready.
  summary_status: z.string().nullable().optional(),
  silent_meeting: z.boolean().nullable().optional(),
});

export const FirefliesTranscriptMetaZ = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  date: z.union([z.string(), z.number()]),
  duration: z.number().nullable().optional(),
  transcript_url: z.string().url().nullable().optional(),
  meeting_link: z.string().nullable().optional(),
  organizer_email: z.string().nullable().optional(),
  // `calendar_type` carries values like 'google' / 'outlook'. The platform
  // (Google Meet / Zoom / mobile-recording) is encoded in the `meeting_link`
  // URL when present; downstream consumers can parse it if needed.
  calendar_type: z.string().nullable().optional(),
  meeting_info: FirefliesMeetingInfoZ.nullable().optional(),
  attendees: z.array(FirefliesAttendeeZ).default([]),
  meeting_attendees: z.array(FirefliesAttendeeZ).optional(),
});

export type FirefliesTranscriptMeta = z.infer<typeof FirefliesTranscriptMetaZ>;

export const FirefliesTranscriptFullZ = FirefliesTranscriptMetaZ.extend({
  sentences: z.array(z.object({
    speaker_name: z.string().nullable().optional(),
    text: z.string(),
    start_time: z.number().nullable().optional(),
    end_time: z.number().nullable().optional(),
  })).default([]),
});

export type FirefliesTranscriptFull = z.infer<typeof FirefliesTranscriptFullZ>;
