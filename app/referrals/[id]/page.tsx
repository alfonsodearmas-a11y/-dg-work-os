import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { getReferralById, getReferralAuditLog } from '@/lib/referrals/queries';
import { ReferralDetailClient } from '../_components/ReferralDetailClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReferralDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await requireRole(['dg', 'ps']);
  if (result instanceof NextResponse) notFound();
  const { session } = result;

  const [referral, audit] = await Promise.all([getReferralById(id), getReferralAuditLog(id)]);
  if (!referral) notFound();

  const userIds = Array.from(new Set([referral.referred_by, ...audit.map((a) => a.changed_by)]));
  const userLookup: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .in('id', userIds);
    for (const u of users ?? []) {
      userLookup[u.id] = u.name ?? u.email ?? 'unknown';
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <ReferralDetailClient
        referral={referral}
        audit={audit}
        userLookup={userLookup}
        canEdit={session.user.role === 'dg'}
      />
    </div>
  );
}
