import { AlertTriangle } from 'lucide-react';

export default function DelayedProjectsPage() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center space-x-3 mb-8">
        <AlertTriangle className="h-8 w-8 text-[#dc2626]" />
        <div>
          <h1 className="text-3xl font-bold text-white">Delayed Projects</h1>
          <p className="text-[#64748b] text-sm mt-1">Projects behind schedule requiring attention</p>
        </div>
      </div>
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">Delayed projects view coming soon</p>
      </div>
    </div>
  );
}
