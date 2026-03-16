'use client';

import { useMemo } from 'react';

/**
 * Shared background + card shell for auth pages (login, set-password, etc).
 * Renders the aurora, particles, orbs, logo, and security badge.
 * Pass card body content as `children`.
 */
export function AuthPageShell({ children }: { children: React.ReactNode }) {
  const particles = useMemo(() =>
    Array.from({ length: 40 }, () => ({
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

      <div className="login-orbs">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
      </div>

      <div className="login-particles">
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

        {children}

        <div className="login-security-badge">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>Secure Authentication</span>
        </div>
      </div>
    </div>
  );
}
