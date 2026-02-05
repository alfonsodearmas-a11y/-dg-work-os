import { Shield } from 'lucide-react';

export default function GCAAIntelPage() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center space-x-3 mb-8">
        <Shield className="h-8 w-8 text-[#d4af37]" />
        <div>
          <h1 className="text-3xl font-bold text-white">GCAA Compliance</h1>
          <p className="text-[#64748b] text-sm mt-1">Guyana Civil Aviation Authority — Safety & Compliance</p>
        </div>
      </div>
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">GCAA compliance dashboard coming soon</p>
      </div>
    </div>
  );
}
