import { NextResponse } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth-helpers';
import { fmtGuyanaDate } from '@/lib/format';
import { getReferralById } from '@/lib/referrals/queries';
import { REQUESTED_ACTION_LABELS } from '@/lib/referrals/types';
import { ReferralStatusBadge } from '@/components/referrals/ReferralStatusBadge';
import { Forbidden } from '@/components/layout/Forbidden';
import { MinisterReferralActions } from '../_components/MinisterReferralActions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MinisterReferralDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await requireRole(['minister']);
  if (result instanceof NextResponse) {
    if (result.status === 403) {
      return <Forbidden detail="This view is reserved for the Minister." />;
    }
    redirect('/login');
  }

  const referral = await getReferralById(id);
  if (!referral) notFound();
  if (referral.status === 'drafted') notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <article className="card-premium p-8 space-y-5">
        <header className="border-b-2 border-gold-500 pb-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-md bg-navy-800 flex items-center justify-center text-gold-500 text-xs font-bold">
            MPUA
          </div>
          <div>
            <h2 className="font-bold text-white">Ministry of Public Utilities and Aviation</h2>
            <p className="text-xs text-navy-400">Cooperative Republic of Guyana</p>
            <p className="text-xs text-navy-400">Brickdam, Stabroek, Georgetown</p>
          </div>
        </header>

        <div className="flex justify-end text-sm font-mono">
          <div className="text-right">
            <p>Ref: {referral.reference_number ?? 'DRAFT'}</p>
            <p>Date: {fmtGuyanaDate(referral.submitted_at, 'long')}</p>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4">
          <p className="font-semibold text-white">
            The Honourable Minister of Public Utilities and Aviation
          </p>
          <ReferralStatusBadge status={referral.status} />
        </div>
        <p className="font-semibold text-white">Subject: {referral.title}</p>

        <Section heading="Background">{referral.background || 'Not provided.'}</Section>
        <Section heading="Current Status">{referral.current_status || 'Not provided.'}</Section>
        <Section heading="Recommendation">{referral.recommendation}</Section>
        <Section heading="Requested Action">{REQUESTED_ACTION_LABELS[referral.requested_action]}</Section>

        <div className="pt-12">
          <p className="text-sm">Respectfully submitted,</p>
          <p className="font-semibold text-white mt-10">{referral.referrer_name ?? 'Director General'}</p>
          <p className="italic text-sm text-navy-300">
            {referral.referrer_title ?? 'Director General, Ministry of Public Utilities and Aviation'}
          </p>
        </div>
      </article>

      <MinisterReferralActions referral={referral} />
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-semibold text-white mb-1">{heading}</h3>
      <p className="text-navy-200 leading-relaxed whitespace-pre-wrap">{children}</p>
    </section>
  );
}
