import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth-helpers';
import { listReferrals } from '@/lib/referrals/queries';
import { ReferralsTable } from './_components/ReferralsTable';

export const dynamic = 'force-dynamic';

export default async function ReferralsPage() {
  const result = await requireRole(['dg', 'ps']);
  if (result instanceof NextResponse) notFound();
  const { session } = result;
  const referrals = await listReferrals({});

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ReferralsTable initial={referrals} canEdit={session.user.role === 'dg'} />
    </div>
  );
}
