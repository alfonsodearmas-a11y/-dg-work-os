'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  agency: string;
  mustChangePassword: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const res = await fetch('/api/auth/profile');
        if (!res.ok) {
          if (!cancelled) {
            setUser(null);
            setError('Not authenticated');
          }
          return;
        }
        const data = await res.json();
        if (!cancelled && data.success) {
          setUser(data.data);
        }
      } catch {
        if (!cancelled) setError('Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProfile();
    return () => { cancelled = true; };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setUser(null);
    router.push('/login?mode=user');
  }, [router]);

  return { user, loading, error, logout };
}
