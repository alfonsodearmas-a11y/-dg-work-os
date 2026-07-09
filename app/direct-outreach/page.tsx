import { Suspense } from 'react';
import { DirectOutreachDashboard } from '@/components/direct-outreach/DirectOutreachDashboard';

// Suspense boundary: the dashboard reads useSearchParams for ?case= deep links.
export default function DirectOutreachPage() {
  return (
    <Suspense fallback={null}>
      <DirectOutreachDashboard />
    </Suspense>
  );
}
