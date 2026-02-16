'use client';

import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, XCircle, Loader2, Unlink } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';

interface ConnectionStatus {
  connected: boolean;
  account_email?: string | null;
  calendar_id?: string | null;
  connected_at?: string | null;
  has_env_fallback?: boolean;
}

export function GoogleCalendarCard() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  // Handle OAuth redirect query params
  useEffect(() => {
    const googleParam = searchParams.get('google');
    if (!googleParam) return;

    if (googleParam === 'connected') {
      setToast({ type: 'success', message: 'Google Calendar connected successfully' });
    } else if (googleParam === 'error') {
      const reason = searchParams.get('reason') || 'Unknown error';
      setToast({ type: 'error', message: `Connection failed: ${reason}` });
    }

    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('google');
    url.searchParams.delete('reason');
    router.replace(url.pathname + url.search, { scroll: false });
  }, [searchParams, router]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Fetch connection status
  useEffect(() => {
    fetch('/api/integrations/google/status')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setStatus(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Refetch after OAuth redirect
  useEffect(() => {
    if (searchParams.get('google') === 'connected') {
      fetch('/api/integrations/google/status')
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setStatus(data); })
        .catch(() => {});
    }
  }, [searchParams]);

  const handleConnect = () => {
    window.location.href = '/api/integrations/google/authorize';
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/integrations/google/disconnect', { method: 'POST' });
      if (res.ok) {
        setStatus({ connected: false, has_env_fallback: status?.has_env_fallback });
        setToast({ type: 'success', message: 'Google Calendar disconnected' });
      } else {
        setToast({ type: 'error', message: 'Failed to disconnect' });
      }
    } catch {
      setToast({ type: 'error', message: 'Failed to disconnect' });
    } finally {
      setDisconnecting(false);
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="card-premium p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-[#d4af37]" />
          <h2 className="text-lg font-semibold text-white">Google Calendar</h2>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-white/5 rounded w-48" />
          <div className="h-10 bg-white/5 rounded w-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="card-premium p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[#d4af37]" />
          <h2 className="text-lg font-semibold text-white">Google Calendar</h2>
        </div>
        {status?.connected ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#059669] bg-[#059669]/10 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Connected
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#64748b] bg-white/5 px-2.5 py-1 rounded-full">
            <XCircle className="h-3.5 w-3.5" />
            Not connected
          </span>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 px-3 py-2 rounded-lg text-sm ${
            toast.type === 'success'
              ? 'bg-[#059669]/10 border border-[#059669]/20 text-[#059669]'
              : 'bg-[#dc2626]/10 border border-[#dc2626]/20 text-[#dc2626]'
          }`}
        >
          {toast.message}
        </div>
      )}

      {status?.connected ? (
        <div className="space-y-3">
          {/* Account info */}
          <div className="space-y-2">
            {status.account_email && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Account</span>
                <span className="text-sm text-white">{status.account_email}</span>
              </div>
            )}
            {status.calendar_id && status.calendar_id !== 'primary' && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Calendar ID</span>
                <span className="text-sm text-white/70 font-mono text-xs">{status.calendar_id}</span>
              </div>
            )}
            {status.connected_at && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Connected</span>
                <span className="text-sm text-white/70">
                  {new Date(status.connected_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Disconnect button */}
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-2 text-sm text-[#dc2626]/80 hover:text-[#dc2626] transition-colors mt-2 disabled:opacity-50"
          >
            {disconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Unlink className="h-4 w-4" />
            )}
            Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-white/40">
            Connect your Google Calendar to sync meetings and events to the Daily Briefing.
          </p>

          {status?.has_env_fallback && (
            <p className="text-xs text-[#d4af37]/70">
              Using environment variable fallback. Connect here for automatic token management.
            </p>
          )}

          <button
            onClick={handleConnect}
            className="btn-gold px-4 py-2 text-sm font-medium rounded-lg"
          >
            Connect Google Calendar
          </button>
        </div>
      )}
    </div>
  );
}
