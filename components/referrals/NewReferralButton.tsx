'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { EscalateModal } from '@/components/today/EscalateModal';

export function NewReferralButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-gold text-sm flex items-center gap-2"
      >
        <Plus size={14} aria-hidden="true" /> New Referral
      </button>
      <EscalateModal
        isOpen={open}
        onClose={() => setOpen(false)}
        sourceType="other"
        sourceId={null}
        preFillTitle={null}
        preFillAgency={null}
      />
    </>
  );
}
