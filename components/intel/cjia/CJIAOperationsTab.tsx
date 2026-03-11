'use client';

import { Upload } from 'lucide-react';
import { InsightCard, type InsightCardData } from '@/components/ui/InsightCard';

// ── Types ───────────────────────────────────────────────────────────────────

interface CJIAOperationsTabProps {
  /** Which tab variant to render: 'revenue' or 'projects' */
  variant: 'revenue' | 'projects';
  revenueInsights?: InsightCardData[];
  projectInsights?: InsightCardData[];
}

// ── Config ──────────────────────────────────────────────────────────────────

const variantConfig = {
  revenue: {
    heading: 'Revenue & Financial',
    title: 'Revenue Data Coming Soon',
    description:
      'Upload CJIA financial reports to see revenue vs. target analysis, aeronautical vs. non-aeronautical revenue breakdown, and cost tracking.',
    insightsLabel: 'AI Revenue Insights',
  },
  projects: {
    heading: 'Infrastructure Projects',
    title: 'Project Data Coming Soon',
    description:
      'Upload CJIA project status reports to track terminal expansion, runway upgrades, and other infrastructure initiatives.',
    insightsLabel: 'AI Project Insights',
  },
} as const;

// ── Component ───────────────────────────────────────────────────────────────

export function CJIAOperationsTab({ variant, revenueInsights, projectInsights }: CJIAOperationsTabProps) {
  const config = variantConfig[variant];
  const insights = variant === 'revenue' ? revenueInsights : projectInsights;

  return (
    <div className="space-y-4">
      <h3 className="text-slate-100 font-medium text-[22px]">{config.heading}</h3>

      <div className="bg-navy-900 rounded-xl border border-navy-800 p-6 md:p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-navy-800 flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-navy-600" />
        </div>
        <h4 className="text-slate-100 text-lg font-semibold mb-2">{config.title}</h4>
        <p className="text-navy-600 text-base max-w-md mx-auto">
          {config.description}
        </p>
      </div>

      {/* AI Insights */}
      {insights && insights.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-gold-500 font-semibold">{config.insightsLabel}</p>
          {insights.map((card, i) => (
            <InsightCard key={i} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
