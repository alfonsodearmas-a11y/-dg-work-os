import { Plane } from 'lucide-react';

export default function CJIAIntelPage() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center space-x-3 mb-8">
        <Plane className="h-8 w-8 text-[#d4af37]" />
        <div>
          <h1 className="text-3xl font-bold text-white">CJIA Passenger Analytics</h1>
          <p className="text-[#64748b] text-sm mt-1">Cheddi Jagan International Airport — Traffic & Operations</p>
        </div>
      </div>
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">CJIA analytics coming soon</p>
      </div>
    </div>
  );
}
