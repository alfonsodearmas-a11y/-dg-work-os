'use client';

import dynamic from 'next/dynamic';
import { SerwistProvider } from '@serwist/turbopack/react';

const PWAProvider = dynamic(
  () => import('./PWAProvider').then((m) => m.PWAProvider),
  { ssr: false }
);

export function PWAWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js">
      <PWAProvider>{children}</PWAProvider>
    </SerwistProvider>
  );
}
