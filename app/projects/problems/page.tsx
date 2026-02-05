import { Flag } from 'lucide-react';

export default function FlaggedProblemsPage() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center space-x-3 mb-8">
        <Flag className="h-8 w-8 text-[#dc2626]" />
        <div>
          <h1 className="text-3xl font-bold text-white">Flagged Issues</h1>
          <p className="text-[#64748b] text-sm mt-1">Problems and issues requiring DG attention</p>
        </div>
      </div>
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">Flagged issues view coming soon</p>
      </div>
    </div>
  );
}
