'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Stable random values for particles
  const particles = useMemo(() =>
    Array.from({ length: 50 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 8 + Math.random() * 10,
      size: Math.random() < 0.15 ? 3 : Math.random() < 0.4 ? 2 : 1,
      opacity: 0.1 + Math.random() * 0.2,
    })), []);

  // Auto-focus input after entrance animations
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 1200);
    return () => clearTimeout(t);
  }, []);

  // Parallax on desktop — move card, particles, and orbs
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;

    const handleMouse = (e: MouseEvent) => {
      const px = (e.clientX / window.innerWidth - 0.5);
      const py = (e.clientY / window.innerHeight - 0.5);

      const particlesEl = document.getElementById('login-particles');
      if (particlesEl) {
        particlesEl.style.transform = `translate(${px * 12}px, ${py * 12}px)`;
      }

      const orbsEl = document.getElementById('login-orbs');
      if (orbsEl) {
        orbsEl.style.transform = `translate(${px * -20}px, ${py * -20}px)`;
      }

      const card = cardRef.current;
      if (card) {
        card.style.transform = `translateY(-5%) perspective(800px) rotateY(${px * 2}deg) rotateX(${-py * 2}deg)`;
      }
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
          setTimeout(() => router.push('/'), 600);
        }, 800);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Invalid access code');
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setPassword('');
        setTimeout(() => inputRef.current?.focus(), 100);
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
      {/* Deep space background */}
      <div className="login-bg" />

      {/* Aurora bands */}
      <div className="login-aurora">
        <div className="login-aurora-band login-aurora-1" />
        <div className="login-aurora-band login-aurora-2" />
        <div className="login-aurora-band login-aurora-3" />
      </div>

      {/* Radial pulse */}
      <div className="login-pulse" />

      {/* Floating orbs */}
      <div id="login-orbs" className="login-orbs">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
      </div>

      {/* Particles — multi-size, multi-opacity */}
      <div id="login-particles" className="login-particles">
        {particles.map((p, i) => (
          <span
            key={i}
            className={`login-particle login-particle-${p.size === 3 ? 'lg' : p.size === 2 ? 'md' : 'sm'}`}
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--particle-opacity': p.opacity,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Scan line */}
      <div className="login-scanline" />

      {/* Glass card */}
      <form
        onSubmit={handleSubmit}
        ref={cardRef}
        className={`login-card ${shake ? 'login-shake' : ''} ${success ? 'login-success-card' : ''}`}
      >
        {/* Animated border gradient */}
        <div className="login-card-glow" />
        <div className="login-card-shine" />

        {/* Logo with rings */}
        <div className="login-logo">
          <div className="login-logo-ring login-logo-ring-1" />
          <div className="login-logo-ring login-logo-ring-2" />
          <div className="login-logo-ring login-logo-ring-3" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ministry-logo.png"
            alt="Ministry Logo"
            width={72}
            height={72}
            className="login-logo-img w-14 h-14 md:w-[72px] md:h-[72px]"
          />
        </div>

        {/* Title */}
        <h1 className="login-title">
          <span className="login-title-text">DG Work OS</span>
        </h1>
        <p className="login-subtitle">Ministry of Public Utilities & Aviation</p>
        <div className="login-divider" />

        {/* Input */}
        <div className={`login-input-wrap ${error ? 'login-input-error' : ''} ${focused ? 'login-input-focused' : ''}`}>
          <svg className="login-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Enter access code"
            className="login-input"
            autoComplete="current-password"
            disabled={success}
          />
          {focused && <div className="login-input-glow" />}
        </div>
        {error && <p className="login-error">{error}</p>}

        {/* Button */}
        <button
          type="submit"
          disabled={loading || success || !password.trim()}
          className={`login-btn ${success ? 'login-btn-success' : ''}`}
        >
          <span className="login-btn-shimmer" />
          {loading ? (
            <span className="login-spinner" />
          ) : success ? (
            <>
              <div className="login-success-burst" />
              <svg className="login-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </>
          ) : (
            'Enter'
          )}
        </button>

        {/* Security badge */}
        <div className="login-security-badge">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>Secure Access</span>
        </div>
      </form>
    </div>
  );
}
