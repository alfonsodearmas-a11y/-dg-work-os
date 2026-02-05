'use client';

import { ReactNode } from 'react';

interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className = '' }: TableProps) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-[#2d3a52] ${className}`}>
      <table className="table-premium min-w-full">
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

export function TableHead({ children, className = '' }: TableProps) {
  return (
    <th className={className}>
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
