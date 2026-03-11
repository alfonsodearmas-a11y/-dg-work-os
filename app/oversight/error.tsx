'use client';

import { SegmentError } from '@/components/ui/SegmentError';

export default function OversightError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError message="Unable to load oversight data" error={error} reset={reset} />;
}
