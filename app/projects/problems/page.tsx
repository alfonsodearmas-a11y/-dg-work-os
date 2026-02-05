'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingDown, AlertCircle, ChevronRight } from 'lucide-react';

export default function ProblemProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProblems() {
      try {
        const res = await fetch('/api/projects/problems');
        const data = await res.json();
        setProjects(data);
      } catch (error) {
        console.error('Failed to fetch problem projects:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchProblems();
  }, []);

  function formatCurrency(value: number | null): string {
    if (!value) return '-';
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toLocaleString()}`;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start space-x-4">
        <Link
          href="/projects"
          className="p-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors mt-1"
        >
          <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center">
            <TrendingDown className="h-8 w-8 mr-3 text-orange-400" />
            Problem Projects
          </h1>
          <p className="text-[#64748b] mt-1">
            {projects.length} projects where spending exceeds completion by 10%+
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : projects.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-emerald-400" />
          </div>
          <p className="text-white font-medium">No problem projects</p>
          <p className="text-[#64748b] text-sm mt-1">All projects have healthy spending ratios</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const spendPercent = project.allocated_balance && project.total_expenditure
              ? (project.total_expenditure / project.allocated_balance) * 100
              : 0;
            const gap = spendPercent - (project.completion_percent || 0);

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="card-premium p-6 block hover:border-[#d4af37]/50 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="px-3 py-1 rounded-lg text-sm font-bold bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-[#0a1628]">
                        {project.sub_agency}
                      </span>
                      <span className="px-3 py-1 rounded-lg text-sm font-medium bg-orange-500/20 text-orange-400">
                        {gap.toFixed(0)}% over-spent
                      </span>
                      <span className="text-[#64748b] text-sm font-mono">{project.project_reference}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white">{project.project_name}</h3>
                    <p className="text-[#94a3b8] mt-1">{project.contractor || 'No contractor assigned'}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-xl font-bold text-[#d4af37]">{formatCurrency(project.contract_value)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-[#64748b] ml-4 flex-shrink-0" />
                </div>

                <div className="mt-4 pt-4 border-t border-[#2d3a52] grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[#64748b] text-sm">Completion</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <div className="flex-1 bg-[#2d3a52] rounded-full h-2">
                        <div
                          className="progress-gold h-2"
                          style={{ width: `${Math.min(project.completion_percent || 0, 100)}%` }}
                        />
                      </div>
                      <span className="text-white font-medium text-sm">{project.completion_percent || 0}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[#64748b] text-sm">Spending</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <div className="flex-1 bg-[#2d3a52] rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full"
                          style={{ width: `${Math.min(spendPercent, 100)}%` }}
                        />
                      </div>
                      <span className="text-orange-400 font-medium text-sm">{spendPercent.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
