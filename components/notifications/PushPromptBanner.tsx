'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, X, Share } from 'lucide-react';

const DISMISS_KEY = 'dg-push-prompt-dismissed';
const VISIT_KEY = 'dg-visit-count';
const DISMISS_DAYS = 7;

function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isIOSBrowser(): boolean {
  return isIOSDevice() && !isStandalonePWA();
}

export function PushPromptBanner() {
  const [show, setShow] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [permissionState, setPermissionState] = useState<string>('default');

  useEffect(() => {
    // Track visits
    const visits = parseInt(localStorage.getItem(VISIT_KEY) || '0', 10) + 1;
    localStorage.setItem(VISIT_KEY, String(visits));

    // Don't show on first session
    if (visits < 2) return;

    // Check if already dismissed recently
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_DAYS) return;
    }

    // Check if Notification API is available
    if (!('Notification' in window)) return;

    const perm = Notification.permission;
    setPermissionState(perm);

    // Don't show if already granted or permanently denied
    if (perm === 'granted') return;
    if (perm === 'denied') return;

    // Check if push API is available
    if (!('PushManager' in window)) return;

    // On iOS browser (not standalone), show "add to homescreen" message instead
    if (isIOSBrowser()) {
      setShowIOSInstructions(true);
      setShow(true);
      return;
    }

    // Show the prompt
    setShow(true);
  }, []);

  const handleEnable = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission === 'granted') {
        // Get service worker registration
        const registration = await navigator.serviceWorker?.ready;
        if (!registration) return;

        // Get VAPID public key
        const keyRes = await fetch('/api/push/vapid-key');
        if (!keyRes.ok) return;
        const { publicKey } = await keyRes.json();
        if (!publicKey) return;

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
        });

        // Send subscription to server
        const subJSON = subscription.toJSON();
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: 'dg',
            subscription: {
              endpoint: subJSON.endpoint,
              keys: {
                p256dh: subJSON.keys?.p256dh,
                auth: subJSON.keys?.auth,
              },
            },
          }),
        });
      }

      setShow(false);
    } catch (err) {
      console.error('Push subscription error:', err);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }, []);

  if (!show) return null;

  // iOS browser — show "add to homescreen" instructions
  if (showIOSInstructions) {
    return (
      <div className="fixed bottom-20 left-3 right-3 md:bottom-6 md:left-auto md:right-6 md:max-w-sm z-[55] animate-slide-up">
        <div className="bg-[#1a2744]/95 backdrop-blur-md border border-[#2d3a52] rounded-2xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-[#d4af37]/10 flex-shrink-0">
              <Share className="h-5 w-5 text-[#d4af37]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Add to Home Screen</p>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">
                To enable push notifications on iOS, tap the{' '}
                <span className="inline-flex items-center align-middle">
                  <Share className="h-3 w-3 text-[#d4af37] inline" />
                </span>{' '}
                share button, then &quot;Add to Home Screen&quot;.
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg hover:bg-white/5 flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4 text-white/40" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard push permission prompt (already denied means we never show)
  if (permissionState === 'denied') return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 md:bottom-6 md:left-auto md:right-6 md:max-w-sm z-[55] animate-slide-up">
      <div className="bg-[#1a2744]/95 backdrop-blur-md border border-[#2d3a52] rounded-2xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-[#d4af37]/10 flex-shrink-0">
            <Bell className="h-5 w-5 text-[#d4af37]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Enable notifications</p>
            <p className="text-xs text-white/50 mt-1 leading-relaxed">
              Get alerts about meetings and tasks, even when the app is closed.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleEnable}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#d4af37] text-[#0a1628] hover:bg-[#f4d03f] transition-colors"
              >
                Enable
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-1.5 text-xs font-medium rounded-lg text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg hover:bg-white/5 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4 text-white/40" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Utility to convert VAPID key from base64 URL to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
