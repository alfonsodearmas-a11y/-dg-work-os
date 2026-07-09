'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Eye, EyeOff, Check, X, Lock } from 'lucide-react';
import { AuthPageShell } from '@/components/auth/AuthPageShell';

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Cleanup redirect timer on unmount
  useEffect(() => {
    return () => { if (redirectTimer.current) clearTimeout(redirectTimer.current); };
  }, []);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenError('No invite token provided');
      setValidating(false);
      return;
    }

    fetch(`/api/auth/set-password?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setTokenValid(true);
          setUserName(data.name || '');
          setUserEmail(data.email || '');
        } else {
          setTokenError(data.error || 'Invalid invite link');
        }
      })
      .catch(() => setTokenError('Failed to validate invite link'))
      .finally(() => setValidating(false));
  }, [token]);

  // Password strength checks
  const checks = useMemo(() => ({
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    match: password.length > 0 && password === confirm,
  }), [password, confirm]);

  const allValid = checks.length && checks.upper && checks.lower && checks.number && checks.match;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allValid) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(true);
        setSignedIn(Boolean(data.signedIn));
        if (data.signedIn) {
          // The server established a session on this response's cookies — use a
          // full navigation (not client routing) so middleware and server
          // components see the fresh auth cookie.
          redirectTimer.current = setTimeout(() => { window.location.href = '/'; }, 1200);
        } else {
          redirectTimer.current = setTimeout(() => router.push('/login'), 3000);
        }
      } else {
        setError(data.error || 'Failed to set password');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    }

    setSubmitting(false);
  }

  return (
    <AuthPageShell>
      {/* Loading */}
      {validating && (
        <div className="flex flex-col items-center gap-3 py-8">
          <svg className="w-6 h-6 animate-spin text-gold-500" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
          </svg>
          <p className="text-white/50 text-sm">Validating your invite...</p>
        </div>
      )}

      {/* Invalid token */}
      {!validating && !tokenValid && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
            <X className="w-6 h-6 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium mb-1">Invalid Invite Link</p>
            <p className="text-white/40 text-sm">{tokenError}</p>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="login-btn flex items-center justify-center gap-2 w-full mt-2"
          >
            Go to Sign In
          </button>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="w-6 h-6 text-green-400" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium mb-1">Password Created</p>
            <p className="text-white/40 text-sm">
              {signedIn ? "You're signed in — taking you to your dashboard..." : 'Redirecting you to sign in...'}
            </p>
          </div>
        </div>
      )}

      {/* Password form */}
      {!validating && tokenValid && !success && (
        <>
          <div className="text-center mb-4">
            <p className="text-white/60 text-sm">
              Welcome{userName ? `, ${userName}` : ''}! Create a password for your account.
            </p>
            {userEmail && (
              <p className="text-gold-500 text-xs mt-1">{userEmail}</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-3">
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="Create password"
              show={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
            />
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              placeholder="Confirm password"
              show={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
            />

            {/* Strength checks */}
            {password.length > 0 && (
              <div className="space-y-1 pt-1">
                <PasswordCheck label="At least 8 characters" met={checks.length} />
                <PasswordCheck label="Uppercase letter" met={checks.upper} />
                <PasswordCheck label="Lowercase letter" met={checks.lower} />
                <PasswordCheck label="Number" met={checks.number} />
                {confirm.length > 0 && (
                  <PasswordCheck label="Passwords match" met={checks.match} />
                )}
              </div>
            )}

            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !allValid}
              className="login-btn w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                </svg>
              ) : (
                <Lock className="w-4 h-4" />
              )}
              {submitting ? 'Setting password...' : 'Create Password'}
            </button>
          </form>

        </>
      )}
    </AuthPageShell>
  );
}

function PasswordInput({ value, onChange, placeholder, show, onToggle }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
        className="w-full px-4 py-2.5 pr-10 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/25 transition-colors"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function PasswordCheck({ label, met }: { label: string; met: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-xs transition-colors ${met ? 'text-green-400' : 'text-white/30'}`}>
      {met ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </div>
  );
}
