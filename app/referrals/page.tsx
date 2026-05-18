import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth-helpers';
import { listReferrals } from '@/lib/referrals/queries';
import { NewReferralButton } from '@/components/referrals/NewReferralButton';
import { ReferralsTable } from './_components/ReferralsTable';

export const dynamic = 'force-dynamic';

export default async function ReferralsPage() {
  const result = await requireRole(['dg', 'ps']);
  if (result instanceof NextResponse) notFound();
  const { session } = result;
  const referrals = await listReferrals({});
  const isDG = session.user.role === 'dg';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {isDG && (
        <div className="flex justify-end">
          <NewReferralButton />
        </div>
      )}
      <ReferralsTable initial={referrals} canEdit={isDG} />
    </div>
  );
}
