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
}

const BASE = 'card-premium block p-4 lg:p-5 flex flex-col gap-3 min-w-0';

export function BentoCard({ children, href, className, ariaLabel }: BentoCardProps) {
  const finalClass = `${BASE}${className ? ` ${className}` : ''}`;

  if (href) {
    return (
      <Link href={href} className={`${finalClass} group transition-colors`} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  return (
    <article className={finalClass} aria-label={ariaLabel}>
      {children}
    </article>
  );
}
