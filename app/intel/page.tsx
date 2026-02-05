import { Activity } from 'lucide-react';

export default function AgencyIntelPage() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center space-x-3 mb-8">
        <Activity className="h-8 w-8 text-[#d4af37]" />
        <div>
          <h1 className="text-3xl font-bold text-white">Agency Intel</h1>
          <p className="text-[#64748b] text-sm mt-1">Overview of all agency operations and alerts</p>
        </div>
      </div>
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">Agency overview dashboard coming soon</p>
      </div>
    </div>
  );
}
