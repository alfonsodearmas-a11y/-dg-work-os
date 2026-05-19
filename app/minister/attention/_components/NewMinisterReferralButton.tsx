'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileSignature } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { ReferToMinisterDialog } from '@/components/today/ReferToMinisterDialog';

/**
 * DG-only entry point for a sourceless Minister referral. Opens the
 * ReferToMinisterDialog directly (skips the EscalateModal menu, since the
 * NPTAB path does not apply when there is no tender behind the request).
 */
export function NewMinisterReferralButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-gold text-sm flex items-center gap-2"
      >
        <Plus size={14} aria-hidden="true" /> New Minister Referral
      </button>
      <SlidePanel
        isOpen={open}
        onClose={() => setOpen(false)}
        title="New Minister Referral"
        icon={FileSignature}
        accentColor="from-gold-500/20 to-gold-700/20"
      >
        <ReferToMinisterDialog
          sourceType="other"
          sourceId={null}
          preFillTitle={null}
          preFillAgency={null}
          onSubmitted={({ taskId }) => {
            setOpen(false);
            router.refresh();
            void taskId;
          }}
          onCancel={() => setOpen(false)}
        />
      </SlidePanel>
    </>
  );
}
