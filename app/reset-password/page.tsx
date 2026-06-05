'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { getBrowserSupabase } from '@/lib/supabase/client';

// Lands here from the recovery email via /auth/callback (verifyOtp sets the
// session cookie). With a valid recovery session, updateUser({ password })
// completes the reset and the user is already signed in.
export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = getBrowserSupabase();
    (async () => {
      const { data, error: userError } = await supabase.auth.getUser();
      setHasSession(!userError && !!data?.user);
      setChecking(false);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');

    const supabase = getBrowserSupabase();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message || 'Could not update password. The link may have expired.');
      setLoading(false);
    } else {
      // Already signed in on the recovery session — full navigation so the
      // middleware picks up the refreshed cookie.
      window.location.href = '/';
    }
  }

  return (
    <AuthPageShell>
      {checking ? (
        <p className="text-white/40 text-sm text-center mb-4">Checking your reset link…</p>
      ) : !hasSession ? (
        <div className="w-full text-center space-y-4 mb-4">
          <p className="text-white/90 text-sm">This reset link is invalid or has expired.</p>
          <Link href="/forgot-password" className="inline-block text-gold-500 text-xs underline">
            Request a new reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w-full space-y-3 mb-4">
          <p className="text-white/60 text-xs text-center mb-1">Choose a new password.</p>
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-colors"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-colors"
          />
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="login-btn w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating…' : 'Set new password'}
          </button>
        </form>
      )}
    </AuthPageShell>
  );
}
