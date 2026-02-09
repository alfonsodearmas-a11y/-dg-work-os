'use client';

import { useState, useEffect, useCallback } from 'react';
import { Smartphone, Monitor, Send, Trash2, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface PushSub {
  id: string;
  endpoint: string;
  platform: string;
  device_info: string | null;
  active: boolean;
  last_used_at: string;
  created_at: string;
}

function platformLabel(platform: string): string {
  switch (platform) {
    case 'ios': return 'iPhone / iPad';
    case 'macos': return 'macOS';
    case 'android': return 'Android';
    case 'windows': return 'Windows';
    default: return 'Unknown Device';
  }
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'ios' || platform === 'android') {
    return <Smartphone className="h-4 w-4 text-white/50" />;
  }
  return <Monitor className="h-4 w-4 text-white/50" />;
}

function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOSBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalonePWA();
}

export function PushNotificationSettings() {
  const [permissionState, setPermissionState] = useState<string>('default');
  const [subscriptions, setSubscriptions] = useState<PushSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);

  // Load permission state and subscriptions
  useEffect(() => {
    if ('Notification' in window) {
      setPermissionState(Notification.permission);
    }

    // Get current device's push subscription endpoint
    navigator.serviceWorker?.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        if (sub) setCurrentEndpoint(sub.endpoint);
      });
    }).catch(() => {});

    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch('/api/push/subscribe?user_id=dg');
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleEnable = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission === 'granted') {
        const registration = await navigator.serviceWorker?.ready;
        if (!registration) return;

        const keyRes = await fetch('/api/push/vapid-key');
        if (!keyRes.ok) return;
        const { publicKey } = await keyRes.json();
        if (!publicKey) return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
        });

        const subJSON = subscription.toJSON();
        setCurrentEndpoint(subJSON.endpoint || null);

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: 'dg',
            subscription: {
              endpoint: subJSON.endpoint,
              keys: { p256dh: subJSON.keys?.p256dh, auth: subJSON.keys?.auth },
            },
          }),
        });

        fetchSubscriptions();
      }
    } catch (err) {
      console.error('Enable push error:', err);
    }
  }, []);

  const handleDisableThisDevice = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker?.ready;
      const sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        setCurrentEndpoint(null);
        fetchSubscriptions();
      }
    } catch (err) {
      console.error('Disable push error:', err);
    }
  }, []);

  const handleDeleteDevice = useCallback(async (id: string) => {
    try {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      fetchSubscriptions();
    } catch {
      // ignore
    }
  }, []);

  const handleTestPush = useCallback(async () => {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'dg' }),
      });
      const data = await res.json();
      if (data.sent > 0) {
        setTestResult(`Sent to ${data.sent} of ${data.total} device${data.total > 1 ? 's' : ''}`);
      } else {
        setTestResult('No active devices to send to');
      }
    } catch {
      setTestResult('Failed to send test');
    } finally {
      setTestSending(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  }, []);

  const activeCount = subscriptions.filter(s => s.active).length;

  // Status display
  let statusIcon: React.ReactNode;
  let statusText: string;
  let statusColor: string;

  if (permissionState === 'granted' && activeCount > 0) {
    statusIcon = <CheckCircle className="h-4 w-4 text-[#059669]" />;
    statusText = 'Enabled';
    statusColor = 'text-[#059669]';
  } else if (permissionState === 'denied') {
    statusIcon = <XCircle className="h-4 w-4 text-[#dc2626]" />;
    statusText = 'Blocked';
    statusColor = 'text-[#dc2626]';
  } else {
    statusIcon = <AlertCircle className="h-4 w-4 text-[#d4af37]" />;
    statusText = 'Not set up';
    statusColor = 'text-[#d4af37]';
  }

  return (
    <div className="card-premium p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-[#d4af37]" />
          <h2 className="text-lg font-semibold text-white">Push Notifications</h2>
        </div>
        <div className={`flex items-center gap-1.5 ${statusColor}`}>
          {statusIcon}
          <span className="text-xs font-medium">{statusText}</span>
        </div>
      </div>

      {/* Blocked state instructions */}
      {permissionState === 'denied' && (
        <div className="mb-4 p-3 rounded-lg bg-[#dc2626]/10 border border-[#dc2626]/20">
          <p className="text-xs text-[#dc2626]/80 leading-relaxed">
            Push notifications are blocked. To re-enable:
          </p>
          <ul className="text-xs text-[#dc2626]/60 mt-1 space-y-0.5 list-disc ml-4">
            <li>Click the lock icon in the address bar</li>
            <li>Find &quot;Notifications&quot; and change to &quot;Allow&quot;</li>
            <li>Refresh the page</li>
          </ul>
        </div>
      )}

      {/* iOS browser instructions */}
      {isIOSBrowser() && (
        <div className="mb-4 p-3 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/20">
          <p className="text-xs text-[#d4af37]/80 leading-relaxed">
            Push notifications on iOS require the app to be added to your Home Screen.
            Tap the share button, then &quot;Add to Home Screen&quot;.
          </p>
        </div>
      )}

      {/* Enable / Re-register button */}
      {permissionState !== 'denied' && !isIOSBrowser() && (permissionState !== 'granted' || activeCount === 0) && (
        <button
          onClick={handleEnable}
          className="w-full mb-4 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#d4af37] text-[#0a1628] hover:bg-[#f4d03f] transition-colors"
        >
          {permissionState === 'granted' ? 'Re-register This Device' : 'Enable Push Notifications'}
        </button>
      )}

      {/* Device list */}
      {!loading && subscriptions.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Registered Devices</p>
          <div className="space-y-2">
            {subscriptions.map(sub => {
              const isCurrent = sub.endpoint === currentEndpoint;
              return (
                <div
                  key={sub.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    sub.active
                      ? 'bg-white/5 border-[#2d3a52]/50'
                      : 'bg-white/[0.02] border-[#2d3a52]/20 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlatformIcon platform={sub.platform} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white">
                          {platformLabel(sub.platform)}
                        </p>
                        {isCurrent && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#d4af37]/15 text-[#d4af37] font-medium uppercase">
                            This device
                          </span>
                        )}
                        {!sub.active && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#dc2626]/15 text-[#dc2626] font-medium uppercase">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/30 mt-0.5">
                        Last active: {relativeDate(sub.last_used_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => isCurrent ? handleDisableThisDevice() : handleDeleteDevice(sub.id)}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
                    title={isCurrent ? 'Disable push on this device' : 'Remove device'}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-white/30 hover:text-[#dc2626]" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Test notification button */}
      {permissionState === 'granted' && activeCount > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleTestPush}
            disabled={testSending}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[#2d3a52] text-white/60 hover:text-white hover:border-[#d4af37]/40 transition-colors disabled:opacity-50"
          >
            {testSending ? 'Sending...' : 'Send test notification'}
          </button>
          {testResult && (
            <span className="text-xs text-white/40">{testResult}</span>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && subscriptions.length === 0 && permissionState === 'granted' && (
        <p className="text-xs text-white/30">
          No devices registered. Push subscription may have expired — click Enable to re-register.
        </p>
      )}
    </div>
  );
}

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
