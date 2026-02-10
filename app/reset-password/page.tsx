'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [state, setState] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }

    fetch(`/api/auth/verify-token?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid && data.type === 'password_reset') {
          setUserName(data.user.full_name);
          setState('valid');
        } else if (data.valid) {
          // Token is valid but wrong type
          setState('invalid');
        } else {
          setState(data.reason === 'expired' ? 'expired' : 'invalid');
        }
      })
      .catch(() => setState('invalid'));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => router.push('/login?mode=user'), 2000);
      } else {
        setError(data.error || 'Reset failed');
      }
    } catch {
      setError('Connection error');
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-[#d4af37] animate-spin" />
      </div>
    );
  }

  if (state === 'invalid' || state === 'expired') {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4">
        <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl max-w-md w-full p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-[#d4af37] mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">
            {state === 'expired' ? 'Reset Link Expired' : 'Invalid Link'}
          </h1>
          <p className="text-[#64748b] text-sm">
            {state === 'expired'
              ? 'This reset link has expired. Ask the Director General to send a new one.'
              : 'This link is invalid or has already been used.'}
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4">
        <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl max-w-md w-full p-8 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Password Reset</h1>
          <p className="text-[#64748b] text-sm">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-[#1a2744] border border-[#2d3a52] rounded-xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-[#0a1628] to-[#1a2744] px-6 py-5 border-b border-[#2d3a52] text-center">
          <h1 className="text-lg font-bold text-[#d4af37]">DG Work OS</h1>
          <p className="text-xs text-[#64748b] mt-1">Reset your password</p>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-[#64748b]">
            Set a new password for <span className="text-white font-medium">{userName}</span>.
          </p>

          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50 pr-10"
                placeholder="Minimum 8 characters"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1.5">Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
              placeholder="Re-enter your password"
              required
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full btn-gold py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Reset Password
          </button>
        </div>
      </form>
    </div>
  );
}
