import { BriefingDashboard } from '@/components/briefing/BriefingDashboard';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export default function Home() {
  return (
    <ErrorBoundary fallbackTitle="Failed to load Daily Briefing">
      <BriefingDashboard />
    </ErrorBoundary>
  );
}
