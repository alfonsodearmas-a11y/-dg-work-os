import type { ReactNode } from 'react';

interface CardHeadProps {
  icon?: ReactNode;
  title: string;
  // Optional accent color for the icon chip (per-agency or per-module hex).
  iconAccent?: string;
  right?: ReactNode;
}

export function CardHead({ icon, title, iconAccent, right }: CardHeadProps) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon ? (
          <span
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0"
            style={
              iconAccent
                ? { background: `${iconAccent}20`, color: iconAccent }
                : { background: 'rgba(212,175,55,0.15)', color: 'var(--gold-500)' }
            }
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600 truncate">
          {title}
        </span>
      </div>
      {right ? <div className="flex items-center gap-2 shrink-0">{right}</div> : null}
    </header>
  );
}
