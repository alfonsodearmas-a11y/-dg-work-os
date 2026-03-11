'use client';

import { SegmentError } from '@/components/ui/SegmentError';

export default function BudgetError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError message="Unable to load budget data" error={error} reset={reset} />;
}
