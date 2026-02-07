'use client';

import dynamic from 'next/dynamic';

const PWAProvider = dynamic(
  () => import('./PWAProvider').then((m) => m.PWAProvider),
  { ssr: false }
);

export function PWAWrapper({ children }: { children: React.ReactNode }) {
  return <PWAProvider>{children}</PWAProvider>;
}
