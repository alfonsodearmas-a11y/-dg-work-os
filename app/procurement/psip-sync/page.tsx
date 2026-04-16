import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { auth } from '@/lib/auth';
import { canAccessPsipSync } from '@/lib/auth-helpers';
import { PsipSyncDiff } from '@/components/procurement/PsipSyncDiff';

export default async function PsipSyncPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  if (!canAccessPsipSync(session.user.role, session.user.agency)) notFound();

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center flex-wrap gap-3 md:gap-4">
        <Link
          href="/procurement"
          className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0">
            <RefreshCw className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-white">PSIP Sync — GWI</h1>
            <p className="text-xs md:text-sm text-navy-600">
              Upload the 2026 PSIP Excel file to review procurement status changes before applying.
            </p>
          </div>
        </div>
      </div>

      <PsipSyncDiff />
    </div>
  );
}
