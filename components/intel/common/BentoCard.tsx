import Link from 'next/link';
import type { ReactNode } from 'react';

interface BentoCardProps {
  children: ReactNode;
  // When provided, the entire card is wrapped in a Next.js Link. The card
  // remains a server component; the Link itself handles client navigation.
  href?: string;
  // Tailwind classes that control grid placement and span. The bento parent
  // owns the grid; this card just consumes the cell(s) the parent assigned.
  className?: string;
  // Optional aria-label for screen readers when the card body is mostly
  // visual / numeric.
  ariaLabel?: string;
  // Optional accent hex color. When set, a 2px gradient strip is painted at
  // the top of the card and fades at the edges — used to mark a hero / feature
  // card within a bento.
  accent?: string;
}

const BASE = 'card-premium relative overflow-hidden block p-4 lg:p-5 flex flex-col gap-3 min-w-0';

export function BentoCard({ children, href, className, ariaLabel, accent }: BentoCardProps) {
  const finalClass = `${BASE}${className ? ` ${className}` : ''}`;
  const strip = accent ? (
    <span
      aria-hidden="true"
      className="absolute left-0 right-0 top-0 h-[2px] pointer-events-none opacity-70"
      style={{
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
      }}
    />
  ) : null;

  if (href) {
    return (
      <Link href={href} className={`${finalClass} group transition-colors`} aria-label={ariaLabel}>
        {strip}
        {children}
      </Link>
    );
  }

  return (
    <article className={finalClass} aria-label={ariaLabel}>
      {strip}
      {children}
    </article>
  );
}
