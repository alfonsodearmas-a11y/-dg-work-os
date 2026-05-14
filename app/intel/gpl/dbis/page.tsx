import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { GPLExcelUpload } from '@/components/intel/GPLExcelUpload';

/**
 * GPL DBIS daily upload page.
 *
 * Same auth floor as `/intel/gpl`: middleware blocks anonymous traffic; the
 * underlying API routes (`/api/gpl/upload`, `/api/gpl/upload/confirm`,
 * `/api/gpl/analysis/[id]`) enforce role on the actual upload action. No
 * page-level role gate.
 */
export const metadata = {
  title: 'GPL DBIS Daily Upload',
};

export default function GPLDbisPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/intel/gpl"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to GPL
        </Link>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-500/80">
            GPL · DBIS
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight leading-tight">
            Daily DBIS upload
          </h1>
          <p className="text-navy-600 text-sm mt-0.5">
            Upload the daily DBIS Excel file. Anomaly analysis runs after confirmation.
          </p>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-navy-800 to-transparent" />
      </header>

      <GPLExcelUpload />
    </div>
  );
}
