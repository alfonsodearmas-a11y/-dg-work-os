'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { getBrowserSupabase } from '@/lib/supabase/client';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState(
    errorParam === 'oauth'
      ? 'Google sign-in failed. Please try again.'
      : errorParam === 'link_expired'
        ? 'That sign-in link has expired. Request a new one below.'
        : ''
  );

  async function handleMagicLink() {
    if (!email) {
      setError('Enter your email address first, then request a sign-in link.');
      return;
    }
    setMagicLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      if (res.ok) {
        setMagicSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not send the sign-in link. Please try again.');
      }
    } catch {
      setError('Could not send the sign-in link. Please try again.');
    } finally {
      setMagicLoading(false);
    }
  }

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');

    const supabase = getBrowserSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (signInError) {
      setError('Invalid email or password');
      setLoading(false);
    } else {
      // Full navigation so the middleware picks up the freshly-set session cookie.
      window.location.href = callbackUrl.startsWith('/') ? callbackUrl : '/';
    }
  }

  return (
    <AuthPageShell>
      {/* Email/Password Form */}
      <form onSubmit={handleCredentialsLogin} className="w-full space-y-3 mb-4">
        <div>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-colors"
          />
        </div>
        <div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            minLength={8}
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-colors"
          />
          <div className="text-right mt-1.5">
            <Link href="/forgot-password" className="text-white/40 text-xs underline hover:text-gold-500 transition-colors">
              Forgot password?
            </Link>
          </div>
        </div>
        {error && (
          <p className="text-red-400 text-xs text-center">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !email || !password}
          className="login-btn w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
            </svg>
          )}
          Sign in
        </button>

        {/* Magic-link sign-in (passwordless) */}
        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-white/30 text-[10px] uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
        {magicSent ? (
          <p className="text-white/70 text-xs text-center">
            Sign-in link sent — check your email. The link expires in 1 hour.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={magicLoading}
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm hover:border-gold-500/40 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {magicLoading ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        )}
      </form>
    </AuthPageShell>
  );
}
