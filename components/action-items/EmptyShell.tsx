import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  cta?: ReactNode;
}

export function EmptyShell({ title, subtitle, cta }: Props) {
  return (
    <div className="card-premium flex flex-col items-center justify-center min-h-[60vh] text-center p-12">
      <h1 className="stat-number text-4xl mb-4">{title}</h1>
      {subtitle && (
        <p className="text-[color:var(--navy-600)] max-w-xl mb-6">{subtitle}</p>
      )}
      {cta}
    </div>
  );
}
