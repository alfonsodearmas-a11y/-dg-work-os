import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

interface ForbiddenProps {
  title?: string;
  detail?: string;
}

export function Forbidden({
  title = 'Access denied',
  detail = 'You do not have permission to view this page.',
}: ForbiddenProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="card-premium p-8 max-w-md w-full text-center space-y-3">
        <ShieldAlert size={32} className="mx-auto text-red-400" aria-hidden="true" />
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="text-sm text-navy-400">{detail}</p>
        <Link href="/" className="btn-navy text-sm inline-block">
          Back to Mission Control
        </Link>
      </div>
    </div>
  );
}
