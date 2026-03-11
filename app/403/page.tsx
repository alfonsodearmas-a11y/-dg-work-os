'use client';

import { signOut } from 'next-auth/react';

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        {/* App name */}
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            DG Work <span className="text-gold-500">OS</span>
          </h1>
          <p className="text-xs text-navy-600 uppercase tracking-widest mt-1">
            Ministry of Public Utilities &amp; Aviation
          </p>
        </div>

        {/* Denied message */}
        <div className="card-premium p-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-white">Access not granted</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Your Google account is not authorized to access DG Work OS.
            Contact the Director General to request access.
          </p>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="btn-navy w-full py-3 text-sm font-medium"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
