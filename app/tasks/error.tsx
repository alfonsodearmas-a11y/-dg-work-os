'use client';

import { SegmentError } from '@/components/ui/SegmentError';

export default function TasksError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError message="Unable to load tasks" error={error} reset={reset} />;
}
