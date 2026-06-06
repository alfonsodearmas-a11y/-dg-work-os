'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Eye } from 'lucide-react';
import { useEffectiveUser, type ViewAsTarget } from '@/components/providers/ViewAsProvider';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/people-types';
import { Spinner } from '@/components/ui/Spinner';

interface ViewAsSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string;
  formal_title: string | null;
  agency: string | null;
  is_active: boolean;
  status: string | null;
}

export function ViewAsSelector({ isOpen, onClose }: ViewAsSelectorProps) {
  const { realUser, startViewAs } = useEffectiveUser();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(data => { if (data.users) setUsers(data.users); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users
      .filter(u => u.id !== realUser.id) // Exclude self
      .filter(u => {
        if (!q) return true;
        return (
          (u.name || '').toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          (u.agency || '').toLowerCase().includes(q)
        );
      });
  }, [users, search, realUser.id]);

  const handleSelect = (user: UserRow) => {
    const target: ViewAsTarget = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agency: user.agency,
      title: user.formal_title,
      avatar_url: user.avatar_url,
    };
    startViewAs(target);
    onClose();
  };

  if (!isOpen) return null;

  const getInitials = (name: string | null, email: string) => {
    const src = name || email;
    return src.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[110] flex items-start justify-center pt-[15vh] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="View As User"
        className="card-premium w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-amber-400" />
            <h2 className="text-white font-bold text-base">View As</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-navy-600 hover:text-white hover:bg-navy-800 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-navy-800/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-10 pr-4 py-2.5 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />
          </div>
        </div>

        {/* User List */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-navy-600 text-sm">
              {search ? 'No users match your search.' : 'No other users found.'}
            </div>
          ) : (
            filtered.map(user => {
              const roleLabel = ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role;
              const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.officer;
              const isInactive = user.status === 'suspended' || user.status === 'archived' || !user.is_active;

              return (
                <button
                  key={user.id}
                  onClick={() => handleSelect(user)}
                  className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-navy-800/30 transition-colors text-left ${
                    isInactive ? 'opacity-50' : ''
                  }`}
                >
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-navy-800 flex items-center justify-center text-xs font-bold text-navy-600 shrink-0">
                      {getInitials(user.name, user.email)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {user.name || user.email}
                    </p>
                    <p className="text-navy-600 text-xs truncate">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${roleColor}`}>
                      {roleLabel}
                    </span>
                    {user.agency && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 uppercase">
                        {user.agency}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-navy-800/50">
          <p className="text-navy-600 text-xs">
            See the app exactly as this user sees it. Your real session stays intact.
          </p>
        </div>
      </div>
    </div>
  );
}
