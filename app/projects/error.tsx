'use client';

import { SegmentError } from '@/components/ui/SegmentError';

export default function ProjectsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError message="Unable to load projects" error={error} reset={reset} />;
}
