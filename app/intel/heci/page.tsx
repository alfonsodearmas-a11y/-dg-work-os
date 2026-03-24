import { ArrowLeft, Lightbulb } from 'lucide-react';
import Link from 'next/link';

export default function HECIIntelPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 md:gap-4">
        <Link
          href="/intel"
          className="p-2.5 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500 transition-colors touch-active shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="p-2 md:p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 shadow-lg shrink-0">
            <Lightbulb className="text-white" size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-white truncate">HECI Deep Dive</h1>
            <p className="text-navy-600 text-xs md:text-sm truncate">Hinterland Electrification Company Inc.</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-8 text-center">
        <Lightbulb className="h-12 w-12 text-amber-500/40 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">HECI Module Coming Soon</h2>
        <p className="text-navy-600 text-sm max-w-md mx-auto">
          Hinterland electrification operational data, grid expansion tracking, and rural power metrics will be available here.
        </p>
      </div>
    </div>
  );
}
