import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth-helpers';
import { listReferralsForMinister } from '@/lib/referrals/queries';
import { MinisterReferralsList } from './_components/MinisterReferralsList';

export const dynamic = 'force-dynamic';

export default async function MinisterReferralsPage() {
  const result = await requireRole(['minister']);
  if (result instanceof NextResponse) notFound();
  const referrals = await listReferralsForMinister();
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <MinisterReferralsList referrals={referrals} />
    </div>
  );
}
