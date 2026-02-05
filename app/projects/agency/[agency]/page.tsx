import { Building2 } from 'lucide-react';

export default async function AgencyProjectsPage({ params }: { params: Promise<{ agency: string }> }) {
  const { agency } = await params;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center space-x-3 mb-8">
        <Building2 className="h-8 w-8 text-[#d4af37]" />
        <div>
          <h1 className="text-3xl font-bold text-white">{agency.toUpperCase()} Projects</h1>
          <p className="text-[#64748b] text-sm mt-1">All projects for {agency.toUpperCase()}</p>
        </div>
      </div>
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">Agency project list coming soon</p>
      </div>
    </div>
  );
}
