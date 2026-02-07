'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { prefetchAllStores } from '@/lib/offline/sync-manager';
import { OfflineBanner } from './OfflineBanner';
import { ConnectivityPill } from './ConnectivityPill';
import { SyncToast } from './SyncToast';
import { X, Download, RefreshCw } from 'lucide-react';

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const { isOnline, wasOffline, isSyncing, syncQueueCount } = useOnlineStatus();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [showIOSInstall, setShowIOSInstall] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const prefetchedRef = useRef(false);

  // Serwist handles SW registration — just detect updates
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    });
  }, []);

  // Startup prefetch
  useEffect(() => {
    if (isOnline && !prefetchedRef.current) {
      prefetchedRef.current = true;
      prefetchAllStores().catch(() => {});
    }
  }, [isOnline]);

  // Refresh data when coming back online
  useEffect(() => {
    if (wasOffline && isOnline) {
      prefetchAllStores().catch(() => {});
    }
  }, [wasOffline, isOnline]);

  // Install prompt (Android/Desktop)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;

      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (dismissed) {
        const dismissedAt = parseInt(dismissed, 10);
        if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
      }

      if (window.matchMedia('(display-mode: standalone)').matches) return;

      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // iOS install prompt
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone);

    if (isIOS && isSafari && !isStandalone) {
      const dismissed = localStorage.getItem('pwa-ios-install-dismissed');
      if (dismissed) {
        const dismissedAt = parseInt(dismissed, 10);
        if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
      }
      setShowIOSInstall(true);
    }
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPromptRef.current) return;
    deferredPromptRef.current.prompt();
    await deferredPromptRef.current.userChoice;
    deferredPromptRef.current = null;
    setShowInstall(false);
  }, []);

  const dismissInstall = useCallback(() => {
    setShowInstall(false);
    localStorage.setItem('pwa-install-dismissed', String(Date.now()));
  }, []);

  const dismissIOSInstall = useCallback(() => {
    setShowIOSInstall(false);
    localStorage.setItem('pwa-ios-install-dismissed', String(Date.now()));
  }, []);

  const handleUpdate = useCallback(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
      window.location.reload();
    }
  }, []);

  return (
    <>
      <OfflineBanner />
      <ConnectivityPill isOnline={isOnline} isSyncing={isSyncing} syncQueueCount={syncQueueCount} />
      <SyncToast />

      {/* Update available toast */}
      {updateAvailable && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 z-[999] animate-slide-up">
          <div className="bg-[#1a2744] border border-[#d4af37]/30 rounded-xl p-4 shadow-xl flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-[#d4af37] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Update available</p>
              <p className="text-xs text-[#64748b]">A new version is ready</p>
            </div>
            <button
              onClick={handleUpdate}
              className="px-3 py-1.5 rounded-lg bg-[#d4af37] text-[#0a1628] text-xs font-semibold hover:bg-[#c9a432] transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Android/Desktop install banner */}
      {showInstall && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 z-[999] animate-slide-up">
          <div className="bg-[#1a2744] border border-[#d4af37]/30 rounded-xl p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <Download className="h-5 w-5 text-[#d4af37] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Install DG Work OS</p>
                <p className="text-xs text-[#64748b] mt-0.5">Add to your home screen for quick access</p>
              </div>
              <button onClick={dismissInstall} className="text-[#64748b] hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="flex-1 px-3 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] text-xs font-semibold hover:bg-[#c9a432] transition-colors"
              >
                Install
              </button>
              <button
                onClick={dismissInstall}
                className="px-3 py-2 rounded-lg bg-[#0a1628] text-[#64748b] text-xs font-medium hover:text-white transition-colors border border-[#2d3a52]"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS install banner */}
      {showIOSInstall && (
        <div className="fixed bottom-20 left-4 right-4 z-[999] animate-slide-up">
          <div className="bg-[#1a2744] border border-[#d4af37]/30 rounded-xl p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <Download className="h-5 w-5 text-[#d4af37] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Install DG Work OS</p>
                <p className="text-xs text-[#94a3b8] mt-1">
                  Tap <span className="inline-block px-1 py-0.5 bg-[#2d3a52] rounded text-white text-[10px]">Share &#x2197;</span> then
                  &quot;Add to Home Screen&quot;
                </p>
              </div>
              <button onClick={dismissIOSInstall} className="text-[#64748b] hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {children}
    </>
  );
}

// Type for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
