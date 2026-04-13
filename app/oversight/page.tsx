import { Suspense } from 'react';
import { WarRoomPage } from '@/components/delayed-projects/WarRoomPage';
import { Spinner } from '@/components/ui/Spinner';

export default function OversightPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>}>
      <WarRoomPage />
    </Suspense>
  );
}
