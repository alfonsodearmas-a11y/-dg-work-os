'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertOctagon, FileSignature, ScrollText } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { ReferralForm } from './ReferralForm';
import { NptabQueueButton } from '@/components/nptab/NptabQueueButton';
import { nextQuarterEnd, periodLabel } from '@/lib/nptab/period';
import type { ReferralSourceType } from '@/lib/referrals/types';

interface EscalateModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceType: ReferralSourceType;
  sourceId: string | null;
  preFillTitle?: string | null;
  preFillAgency?: string | null;
  /** Optional — used by the NPTAB queue panel for SLA context. */
  daysBreach?: number | null;
}

type View = 'menu' | 'refer' | 'nptab';

export function EscalateModal(props: EscalateModalProps) {
  const router = useRouter();
  const [view, setView] = useState<View>('menu');
  const [toast, setToast] = useState<string | null>(null);
  const upcomingPeriod = nextQuarterEnd(new Date());
  const upcomingPeriodLabel = periodLabel(upcomingPeriod.start, upcomingPeriod.end);
  // NPTAB reports cover procurement tenders only.
  const nptabApplies = props.sourceType === 'tender';

  function close() {
    setView('menu');
    setToast(null);
    props.onClose();
  }

  return (
    <SlidePanel
      isOpen={props.isOpen}
      onClose={close}
      title="Escalate"
      subtitle={props.preFillTitle ?? undefined}
      icon={AlertOctagon}
      accentColor="from-red-500/20 to-red-700/20"
    >
      {toast && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-900/40 border border-emerald-700/60 text-emerald-200 text-sm">
          {toast}
        </div>
      )}

      {view === 'menu' && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setView('refer')}
            className="text-left p-4 rounded-xl bg-navy-900 border border-navy-800 hover:border-gold-500/60 transition-colors flex items-start gap-3"
          >
            <FileSignature className="text-gold-500 mt-0.5 flex-shrink-0" size={20} />
            <span>
              <span className="block font-semibold text-white">Refer to Minister</span>
              <span className="block text-sm text-navy-500 mt-1">
                Prepare a formal written referral to the Honourable Minister with background, current status, and a recommendation.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => nptabApplies && setView('nptab')}
            disabled={!nptabApplies}
            className={[
              'text-left p-4 rounded-xl bg-navy-900 border border-navy-800 flex items-start gap-3 transition-colors',
              nptabApplies
                ? 'hover:border-gold-500/60'
                : 'opacity-60 cursor-not-allowed',
            ].join(' ')}
            aria-label="Queue for NPTAB Report"
          >
            <ScrollText className={`mt-0.5 flex-shrink-0 ${nptabApplies ? 'text-gold-500' : 'text-navy-500'}`} size={20} />
            <span>
              <span className="block font-semibold text-white">Queue for NPTAB Report</span>
              <span className="block text-sm text-navy-500 mt-1">
                {nptabApplies
                  ? `Add this tender to the upcoming ${upcomingPeriodLabel} Procurement Performance Report to NPTAB.`
                  : 'NPTAB reports cover procurement tenders only.'}
              </span>
            </span>
          </button>
        </div>
      )}

      {view === 'refer' && (
        <ReferralForm
          sourceType={props.sourceType}
          sourceId={props.sourceId}
          preFillAgency={props.preFillAgency}
          preFillTitle={props.preFillTitle}
          onSubmitted={({ referralId, referenceNumber }) => {
            const msg = referenceNumber
              ? `Submitted as ${referenceNumber}.`
              : 'Saved as draft.';
            setToast(msg);
            setView('menu');
            router.refresh();
            // Auto-close after a short pause so the user sees the confirmation.
            setTimeout(() => close(), 1400);
            void referralId;
          }}
          onCancel={() => setView('menu')}
        />
      )}

      {view === 'nptab' && nptabApplies && props.sourceId && (
        <NptabQueueButton
          tenderId={props.sourceId}
          tenderTitle={props.preFillTitle ?? props.sourceId}
          tenderAgency={props.preFillAgency ?? ''}
          daysBreach={props.daysBreach ?? null}
          upcomingPeriodLabel={upcomingPeriodLabel}
          onCompleted={(message) => {
            setToast(message);
            setView('menu');
            router.refresh();
            setTimeout(() => close(), 1400);
          }}
          onCancel={() => setView('menu')}
        />
      )}
    </SlidePanel>
  );
}
