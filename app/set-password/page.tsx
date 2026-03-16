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
        redirectTimer.current = setTimeout(() => router.push('/login'), 3000);
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
            <p className="text-white/40 text-sm">Redirecting you to sign in...</p>
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

          {/* Google alternative */}
          <div className="w-full flex items-center gap-3 mt-4 mb-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-white/30 text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <button
            onClick={() => router.push('/login')}
            className="login-btn flex items-center justify-center gap-2 w-full"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.15)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google instead
          </button>
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
