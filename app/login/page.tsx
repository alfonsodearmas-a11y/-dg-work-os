'use client';

import { signIn } from 'next-auth/react';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthPageShell } from '@/components/auth/AuthPageShell';

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
  const [error, setError] = useState(errorParam === 'CredentialsSignin' ? 'Invalid email or password' : '');

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      callbackUrl,
      redirect: false,
    });

    if (result?.error) {
      setError('Invalid email or password');
      setLoading(false);
    } else if (result?.url) {
      window.location.href = result.url;
    } else {
      setLoading(false);
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
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/25 transition-colors"
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
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/25 transition-colors"
          />
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
      </form>

      {/* Divider */}
      <div className="w-full flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-white/30 text-xs uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Google Sign In */}
      <button
        onClick={() => signIn('google', { callbackUrl })}
        className="login-btn flex items-center justify-center gap-3 w-full"
        style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.15)' }}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Sign in with Google
      </button>
    </AuthPageShell>
  );
}
