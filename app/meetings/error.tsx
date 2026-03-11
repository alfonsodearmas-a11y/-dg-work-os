'use client';

import { SegmentError } from '@/components/ui/SegmentError';

export default function MeetingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError message="Unable to load meetings" error={error} reset={reset} />;
}
