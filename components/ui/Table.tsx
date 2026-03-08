'use client';

import { ReactNode } from 'react';

interface TableProps {
  children: ReactNode;
  className?: string;
}

interface TableRootProps extends TableProps {
  ariaLabel?: string;
}

export function Table({ children, className = '', ariaLabel }: TableRootProps) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-[#2d3a52] ${className}`}>
      <table className="table-premium min-w-full" aria-label={ariaLabel}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({ children, className = '' }: TableProps) {
  return <tr className={className}>{children}</tr>;
}

interface TableHeadProps extends TableProps {
  scope?: 'col' | 'row';
}

export function TableHead({ children, className = '', scope = 'col' }: TableHeadProps) {
  return (
    <th scope={scope} className={className}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = '' }: TableProps) {
  return (
    <td className={className}>
      {children}
    </td>
  );
}
