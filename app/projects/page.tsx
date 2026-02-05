import { FolderKanban } from 'lucide-react';

export default function ProjectsPage() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center space-x-3 mb-8">
        <FolderKanban className="h-8 w-8 text-[#d4af37]" />
        <div>
          <h1 className="text-3xl font-bold text-white">PSIP Project Tracker</h1>
          <p className="text-[#64748b] text-sm mt-1">Agency summaries, uploads & change tracking</p>
        </div>
      </div>
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">Project tracker coming soon</p>
      </div>
    </div>
  );
}
