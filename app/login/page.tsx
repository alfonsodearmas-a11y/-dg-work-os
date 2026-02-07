'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Auto-focus input after entrance animations
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 1000);
    return () => clearTimeout(t);
  }, []);

  // Subtle parallax on desktop
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;

    const handleMouse = (e: MouseEvent) => {
      const particles = document.getElementById('login-particles');
      if (!particles) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 10;
      const y = (e.clientY / window.innerHeight - 0.5) * 10;
      particles.style.transform = `translate(${x}px, ${y}px)`;
    };

    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password.trim() || loading || success) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          setFadeOut(true);
          setTimeout(() => router.push('/'), 500);
        }, 600);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Invalid access code');
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setPassword('');
        setTimeout(() => inputRef.current?.focus(), 100);
        // Reset error border after 2s
        setTimeout(() => setError(''), 2000);
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }, [password, loading, success, router]);

  return (
    <div className={`login-page ${fadeOut ? 'login-fade-out' : ''}`}>
      {/* Animated background */}
      <div className="login-bg" />
      <div className="login-pulse" />
      <div id="login-particles" className="login-particles">
        {Array.from({ length: 30 }).map((_, i) => (
          <span
            key={i}
            className="login-particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 8}s`,
              animationDuration: `${6 + Math.random() * 6}s`,
            }}
          />
        ))}
      </div>

      {/* Glass card */}
      <form
        onSubmit={handleSubmit}
        ref={cardRef}
        className={`login-card ${shake ? 'login-shake' : ''} ${success ? 'login-success-card' : ''}`}
      >
        {/* Orbiting border glow */}
        <div className="login-card-glow" />

        {/* Logo */}
        <div className="login-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ministry-logo.png"
            alt="Ministry Logo"
            width={72}
            height={72}
            className="login-logo-img"
          />
        </div>

        {/* Title */}
        <h1 className="login-title">DG Work OS</h1>
        <p className="login-subtitle">Ministry of Public Utilities & Aviation</p>
        <div className="login-divider" />

        {/* Input */}
        <div className={`login-input-wrap ${error ? 'login-input-error' : ''}`}>
          <svg className="login-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter access code"
            className="login-input"
            autoComplete="current-password"
            disabled={success}
          />
        </div>
        {error && <p className="login-error">{error}</p>}

        {/* Button */}
        <button
          type="submit"
          disabled={loading || success || !password.trim()}
          className={`login-btn ${success ? 'login-btn-success' : ''}`}
        >
          {loading ? (
            <span className="login-spinner" />
          ) : success ? (
            <svg className="login-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            'Enter'
          )}
        </button>
      </form>
    </div>
  );
}
