'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface MentionUser {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

interface MentionAutocompleteProps {
  users: MentionUser[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onSelect: (user: MentionUser, triggerStart: number, queryLength: number) => void;
}

// Short labels for compact mention popover
const MENTION_ROLE_LABELS: Record<string, string> = {
  dg: 'DG',
  minister: 'Minister',
  ps: 'Perm. Sec.',
  agency_admin: 'Manager',
  officer: 'Analyst',
};

export function MentionAutocomplete({ users, textareaRef, onSelect }: MentionAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [triggerStart, setTriggerStart] = useState(-1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = users.filter((u) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      (u.agency && u.agency.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  }).slice(0, 8);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setTriggerStart(-1);
    setActiveIndex(0);
  }, []);

  // Listen for input/keydown on the textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleInput = () => {
      const value = textarea.value;
      const cursor = textarea.selectionStart;

      // Find the last @ before cursor that isn't preceded by a word char
      let atPos = -1;
      for (let i = cursor - 1; i >= 0; i--) {
        if (value[i] === '@') {
          // Check it's at start or preceded by whitespace
          if (i === 0 || /\s/.test(value[i - 1])) {
            atPos = i;
          }
          break;
        }
        // If we hit whitespace before finding @, stop
        if (/\s/.test(value[i]) && i < cursor - 1) break;
      }

      if (atPos >= 0) {
        const search = value.substring(atPos + 1, cursor);
        // Don't open if there's a space-then-more after the query (completed mention)
        if (search.length <= 40) {
          setTriggerStart(atPos);
          setQuery(search);
          setActiveIndex(0);
          setIsOpen(true);

          // Position dropdown near the textarea
          const rect = textarea.getBoundingClientRect();
          const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
          const textBeforeCursor = value.substring(0, cursor);
          const lines = textBeforeCursor.split('\n');
          const lineNum = lines.length - 1;

          setPosition({
            top: -(filtered.length > 0 ? Math.min(filtered.length, 8) * 40 + 8 : 48) - 4,
            left: Math.min((lines[lineNum]?.length || 0) * 8, rect.width - 240),
          });
          return;
        }
      }

      if (isOpen) close();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filtered.length) % Math.max(filtered.length, 1));
      } else if (e.key === 'Enter' && !e.shiftKey) {
        if (filtered.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const user = filtered[activeIndex];
          if (user) {
            onSelect(user, triggerStart, query.length);
            close();
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        close();
      }
    };

    textarea.addEventListener('input', handleInput);
    textarea.addEventListener('keydown', handleKeyDown, true);
    textarea.addEventListener('blur', () => {
      // Delay close to allow click on dropdown
      setTimeout(close, 200);
    });

    return () => {
      textarea.removeEventListener('input', handleInput);
      textarea.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [textareaRef, isOpen, query, triggerStart, activeIndex, filtered, onSelect, close]);

  // Scroll active item into view
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const item = dropdownRef.current.children[activeIndex] as HTMLElement;
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 w-60 max-h-[320px] overflow-y-auto rounded-lg border shadow-xl"
      style={{
        top: position.top,
        left: Math.max(0, position.left),
        background: '#0f1d35',
        borderColor: 'rgba(212,175,55,0.2)',
      }}
    >
      {filtered.map((user, i) => (
        <button
          key={user.id}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(user, triggerStart, query.length);
            close();
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
            i === activeIndex ? 'bg-gold-500/15' : 'hover:bg-navy-900'
          }`}
        >
          {/* Avatar circle */}
          <div className="w-7 h-7 rounded-full bg-navy-800 flex items-center justify-center shrink-0 text-xs font-medium text-gold-500">
            {user.name
              .split(' ')
              .map((w) => w[0])
              .join('')
              .substring(0, 2)
              .toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{user.name}</p>
            <p className="text-xs text-navy-600 truncate">
              {MENTION_ROLE_LABELS[user.role] || user.role}
              {user.agency && ` · ${user.agency}`}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
