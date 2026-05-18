import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth-helpers';
import { listReferralsForMinister } from '@/lib/referrals/queries';
import { Forbidden } from '@/components/layout/Forbidden';
import { MinisterReferralsList } from './_components/MinisterReferralsList';

export const dynamic = 'force-dynamic';

export default async function MinisterReferralsPage() {
  const result = await requireRole(['minister']);
  if (result instanceof NextResponse) {
    if (result.status === 403) {
      return <Forbidden detail="This view is reserved for the Minister." />;
    }
    redirect('/login');
  }
  const referrals = await listReferralsForMinister();
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <MinisterReferralsList referrals={referrals} />
    </div>
  );
}
