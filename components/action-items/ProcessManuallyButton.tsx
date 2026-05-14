import Link from 'next/link';

// Two flows from a queued meeting row:
//   1. "Run extraction" → /action-items/process?meeting_id=… → click Extract
//      → redirected to /action-items/review/<extraction_id>. The Plan 4
//      pipeline (Claude tool-use, validation, three-bucket review).
//   2. "Add task manually" → /tasks?action=add&meeting_id=… → War Room
//      Add Task modal pre-populated with meeting metadata. Bypasses
//      extraction entirely; useful when the user already knows the
//      single commitment to record.
//
// Plan 3's original ProcessManuallyButton wired (1) by mistake to flow (2).
// Now both buttons render side-by-side; primary = extraction.
export function ProcessManuallyButton({
  meetingId, meetingTitle, meetingDate,
}: {
  meetingId: string; meetingTitle: string | null; meetingDate: string | null;
}) {
  const extractParams = new URLSearchParams();
  extractParams.set('meeting_id', meetingId);

  const manualParams = new URLSearchParams();
  manualParams.set('action', 'add');
  manualParams.set('meeting_id', meetingId);
  if (meetingTitle) manualParams.set('meeting_title', meetingTitle);
  if (meetingDate)  manualParams.set('meeting_date', meetingDate);

  return (
    <span className="inline-flex gap-1">
      <Link href={`/action-items/process?${extractParams.toString()}`}
        className="px-2 py-1 text-xs bg-gold-500 text-navy-950 rounded"
        title="Run Claude extraction on this meeting">
        Run extraction
      </Link>
      <Link href={`/tasks?${manualParams.toString()}`}
        className="px-2 py-1 text-xs border border-navy-700 text-navy-300 rounded hover:text-white"
        title="Skip extraction; create one task referencing this meeting">
        Add task
      </Link>
    </span>
  );
}
