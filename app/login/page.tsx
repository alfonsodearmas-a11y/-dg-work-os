'use client';

import { signIn } from 'next-auth/react';
import { useMemo } from 'react';

export default function LoginPage() {
  const particles = useMemo(() =>
    Array.from({ length: 50 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 8 + Math.random() * 10,
      size: Math.random() < 0.15 ? 3 : Math.random() < 0.4 ? 2 : 1,
      opacity: 0.1 + Math.random() * 0.2,
    })), []);

  return (
    <div className="login-page">
      <div className="login-bg" />

      <div className="login-aurora">
        <div className="login-aurora-band login-aurora-1" />
        <div className="login-aurora-band login-aurora-2" />
        <div className="login-aurora-band login-aurora-3" />
      </div>

      <div className="login-pulse" />

      <div id="login-orbs" className="login-orbs">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
      </div>

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

      <div className="login-scanline" />

      <div className="login-card">
        <div className="login-card-glow" />
        <div className="login-card-shine" />

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

        <h1 className="login-title">
          <span className="login-title-text">DG Work OS</span>
        </h1>
        <p className="login-subtitle">Ministry of Public Utilities & Aviation</p>
        <div className="login-divider" />

        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="login-btn flex items-center justify-center gap-3 w-full"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>

        <div className="login-security-badge">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>Google Workspace Authentication</span>
        </div>
      </div>
    </div>
  );
}
