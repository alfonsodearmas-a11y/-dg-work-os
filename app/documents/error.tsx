'use client';

import { SegmentError } from '@/components/ui/SegmentError';

export default function DocumentsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError message="Unable to load documents" error={error} reset={reset} />;
}
