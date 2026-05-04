import Link from 'next/link';

export function ProcessManuallyButton({
  meetingId, meetingTitle, meetingDate,
}: {
  meetingId: string; meetingTitle: string | null; meetingDate: string | null;
}) {
  const params = new URLSearchParams();
  params.set('action', 'add');
  params.set('meeting_id', meetingId);
  if (meetingTitle) params.set('meeting_title', meetingTitle);
  if (meetingDate)  params.set('meeting_date', meetingDate);
  return (
    <Link href={`/tasks?${params.toString()}`}
      className="px-2 py-1 text-xs bg-gold-500 text-navy-950 rounded">
      Process manually
    </Link>
  );
}
