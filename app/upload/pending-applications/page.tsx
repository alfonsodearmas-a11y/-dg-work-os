'use client';

import { useState, useEffect } from 'react';
import { Loader2, LogOut, Shield } from 'lucide-react';
import { UploadPanel } from '@/components/intel/pending-applications/UploadPanel';

type Agency = 'GPL' | 'GWI';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export default function UploadPortalPage() {
  const [agency, setAgency] = useState<Agency | null>(null);
  const [selectedAgency, setSelectedAgency] = useState<Agency>('GPL');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const saved = getCookie('upload-agency');
    if (saved === 'GPL' || saved === 'GWI') {
      setAgency(saved);
    }
    setChecking(false);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/upload/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency: selectedAgency, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed');
      } else {
        setAgency(selectedAgency);
        setCode('');
      }
    } catch {
      setError('Network error — please try again');
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await fetch('/api/upload/auth?action=logout', { method: 'POST' });
    setAgency(null);
    setCode('');
    setError(null);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-[#d4af37] animate-spin" />
      </div>
    );
  }

  // Authenticated — show upload UI
  if (agency) {
    return (
      <div className="min-h-screen bg-[#0a1628]">
        <header className="border-b border-[#2d3a52]/50 bg-[#0a1628]">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ministry-logo.png" alt="" className="h-8 w-8 rounded-full" />
              <div className="flex items-center gap-2">
                <span className="text-white font-medium text-sm">Upload Portal</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  agency === 'GPL'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-cyan-500/20 text-cyan-400'
                }`}>
                  {agency}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-8">
          <UploadPanel lockedAgency={agency} />
        </div>
      </div>
    );
  }

  // Login form
  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ministry-logo.png" alt="" className="h-16 w-16 rounded-full mx-auto mb-4 ring-2 ring-[#d4af37]/30" />
          <h1 className="text-xl font-semibold text-white">Upload Portal</h1>
          <p className="text-sm text-[#64748b] mt-1">Pending Applications</p>
        </div>

        <form onSubmit={handleLogin} className="card-premium p-6 space-y-5">
          {/* Agency Selection */}
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-2">Agency</label>
            <div className="grid grid-cols-2 gap-2">
              {(['GPL', 'GWI'] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setSelectedAgency(a)}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    selectedAgency === a
                      ? a === 'GPL'
                        ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50'
                        : 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/50'
                      : 'bg-[#1a2744] text-[#64748b] hover:text-[#94a3b8]'
                  }`}
                >
                  {a === 'GPL' ? 'GPL (Power)' : 'GWI (Water)'}
                </button>
              ))}
            </div>
          </div>

          {/* Access Code */}
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-[#94a3b8] mb-2">
              Access Code
            </label>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
              <input
                id="code"
                type="password"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Enter access code"
                required
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] text-sm focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/50"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !code}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#d4af37] text-[#0a1628] font-semibold text-sm hover:bg-[#e5c547] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Verifying...</>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
