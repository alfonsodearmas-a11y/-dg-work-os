'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertOctagon, FileSignature, ScrollText } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { ReferralForm } from './ReferralForm';
import type { ReferralSourceType } from '@/lib/referrals/types';

interface EscalateModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceType: ReferralSourceType;
  sourceId: string | null;
  preFillTitle?: string | null;
  preFillAgency?: string | null;
}

type View = 'menu' | 'refer' | 'nptab';

export function EscalateModal(props: EscalateModalProps) {
  const router = useRouter();
  const [view, setView] = useState<View>('menu');
  const [toast, setToast] = useState<string | null>(null);

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
            disabled
            className="text-left p-4 rounded-xl bg-navy-900/60 border border-navy-800 opacity-60 cursor-not-allowed flex items-start gap-3"
            aria-label="Queue for NPTAB Report (coming soon)"
          >
            <ScrollText className="text-navy-500 mt-0.5 flex-shrink-0" size={20} />
            <span>
              <span className="block font-semibold text-white">
                Queue for NPTAB Report
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-navy-800 text-navy-400">
                  Coming soon
                </span>
              </span>
              <span className="block text-sm text-navy-500 mt-1">
                Stage this item for inclusion in the next NPTAB reporting cycle.
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
    </SlidePanel>
  );
}
