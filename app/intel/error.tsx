'use client';

import { SegmentError } from '@/components/ui/SegmentError';

export default function IntelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError message="Unable to load intel data" error={error} reset={reset} />;
}
