'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Plane, Droplets, Shield, Anchor, Building, Briefcase, BarChart3 } from 'lucide-react';

const AGENCY_CONFIG: Record<string, { label: string; name: string; icon: React.ElementType; color: string }> = {
  gpl: { label: 'GPL', name: 'Guyana Power & Light', icon: Zap, color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
  cjia: { label: 'CJIA', name: 'CJIA Airport', icon: Plane, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  gwi: { label: 'GWI', name: 'Guyana Water Inc.', icon: Droplets, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  gcaa: { label: 'GCAA', name: 'Civil Aviation', icon: Shield, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  marad: { label: 'MARAD', name: 'Maritime Administration', icon: Anchor, color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  heci: { label: 'HECI', name: 'Hinterland Commission', icon: Building, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  ppdi: { label: 'PPDI', name: 'Policy & Development', icon: Briefcase, color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
  has: { label: 'HAS', name: 'Hydro Services', icon: BarChart3, color: 'text-teal-400 bg-teal-500/10 border-teal-500/30' },
};

interface AgencyStats {
  agency: string;
  ceo_name: string | null;
  total_active: number;
  overdue: number;
  awaiting_review: number;
  completed_month: number;
}

export default function AgencyScorecard() {
  const [agencies, setAgencies] = useState<AgencyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        // Fetch stats per agency
        const agencyKeys = Object.keys(AGENCY_CONFIG);
        const statsPromises = agencyKeys.map(async (agency) => {
          const [statsRes, usersRes] = await Promise.all([
            fetch(`/api/tm/tasks/stats?agency=${agency}`).then(r => r.json()),
            fetch('/api/admin/users').then(r => r.json()),
          ]);
          const ceo = usersRes.data?.find((u: any) => u.agency === agency && u.role === 'ceo');
          return {
            agency,
            ceo_name: ceo?.full_name || null,
            total_active: parseInt(statsRes.data?.total_active || '0'),
            overdue: parseInt(statsRes.data?.overdue || '0'),
            awaiting_review: parseInt(statsRes.data?.awaiting_review || '0'),
            completed_month: parseInt(statsRes.data?.completed_this_month || '0'),
          };
        });
        const results = await Promise.all(statsPromises);
        setAgencies(results);
      } catch (err) {
        console.error('Failed to load agency stats:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const getHealth = (stats: AgencyStats) => {
    if (stats.overdue >= 3) return { label: 'Critical', color: 'bg-red-500' };
    if (stats.overdue >= 1) return { label: 'Warning', color: 'bg-yellow-500' };
    return { label: 'Good', color: 'bg-green-500' };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Agency Scorecard</h1>
        <p className="text-sm text-[#64748b] mt-1">Task execution health across agencies</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {agencies.map(stats => {
            const config = AGENCY_CONFIG[stats.agency];
            if (!config) return null;
            const Icon = config.icon;
            const health = getHealth(stats);

            return (
              <button
                key={stats.agency}
                onClick={() => router.push(`/admin/tasks?agency=${stats.agency}`)}
                className={`card-premium p-5 text-left hover:ring-1 hover:ring-[#d4af37]/30 transition-all border ${config.color.split(' ').pop()}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${config.color.split(' ')[0]}`} />
                    <span className="font-bold text-white">{config.label}</span>
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full ${health.color}`} title={health.label} />
                </div>
                <p className="text-xs text-[#64748b] mb-3">{stats.ceo_name || 'No CEO assigned'}</p>

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-white">{stats.total_active}</p>
                    <p className="text-[10px] text-[#64748b]">Active</p>
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${stats.overdue > 0 ? 'text-red-400' : 'text-white'}`}>{stats.overdue}</p>
                    <p className="text-[10px] text-[#64748b]">Overdue</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-purple-400">{stats.awaiting_review}</p>
                    <p className="text-[10px] text-[#64748b]">Review</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-green-400">{stats.completed_month}</p>
                    <p className="text-[10px] text-[#64748b]">Done/mo</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
