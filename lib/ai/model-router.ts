import { ModelTier } from './types';

// ── Query Classification ────────────────────────────────────────────────────
// Routes queries to the cheapest model that can handle them well.

interface ClassifyResult {
  tier: ModelTier;
  queryType: string;
}

// Haiku patterns — simple factual lookups, single-metric questions
const HAIKU_PATTERNS: Array<{ re: RegExp; type: string }> = [
  { re: /^(what|what's|whats)\s+(is|are)\s+(the\s+)?(gpl|gwi|cjia|gcaa)\s+health/i, type: 'health_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(the\s+)?health\s+score/i, type: 'health_lookup' },
  { re: /health\s+score/i, type: 'health_lookup' },
  { re: /^how\s+(many|much)\s+(projects?|tasks?|delayed|overdue)/i, type: 'count_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(the\s+)?(current\s+)?(reserve|capacity|peak|demand)/i, type: 'metric_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(the\s+)?(total\s+)?(portfolio|project)\s+(value|count)/i, type: 'metric_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(the\s+)?collection\s+rate/i, type: 'metric_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(the\s+)?suppressed\s+(demand|mw)/i, type: 'metric_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(the\s+)?compliance\s+rate/i, type: 'metric_lookup' },
  { re: /how\s+many\s+units?\s+(are\s+)?(online|available)/i, type: 'metric_lookup' },
  { re: /^(show|list|give)\s+(me\s+)?(the\s+)?(overdue|delayed)\s+(tasks?|projects?)/i, type: 'list_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(my\s+)?overdue\s+tasks?/i, type: 'list_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(the\s+)?(gpl|gwi|cjia|gcaa)\s+(revenue|profit|passengers|inspections)/i, type: 'metric_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(the\s+)?on.?time\s+performance/i, type: 'metric_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(the\s+)?resolution\s+rate/i, type: 'metric_lookup' },
  { re: /^when\s+(is|are)\s+(my\s+)?(next|today)/i, type: 'schedule_lookup' },
  { re: /^(what|what's|whats)\s+(is|are)\s+(on\s+)?(my|the)\s+(calendar|schedule)\s+(today|this week)/i, type: 'schedule_lookup' },
];

// Opus patterns — complex analysis, strategic questions, comparisons, multi-agency
const OPUS_PATTERNS: Array<{ re: RegExp; type: string }> = [
  { re: /compare\s+(all\s+)?(agency|agencies)/i, type: 'cross_agency_analysis' },
  { re: /across\s+(all\s+)?(agencies|sectors)/i, type: 'cross_agency_analysis' },
  { re: /strategic|strategy|recommend|advise|prioriti[sz]e/i, type: 'strategic_advice' },
  { re: /root\s+cause|why\s+(is|are|did|has|have).*\b(drop|decline|fall|increase|spike|surge)/i, type: 'causal_analysis' },
  { re: /forecast|predict|project(ion)?s?\s+(for|over|next)/i, type: 'forecasting' },
  { re: /trend\s+analysis|long.?term/i, type: 'trend_analysis' },
  { re: /what\s+should\s+(i|we|the dg)\s+(do|focus|prioriti[sz]e)/i, type: 'strategic_advice' },
  { re: /brief\s+(me|the dg)\s+on\s+(everything|all|the full)/i, type: 'comprehensive_briefing' },
  { re: /comprehensive|in.?depth|detailed\s+analysis/i, type: 'deep_analysis' },
  { re: /risk\s+(assessment|analysis|profile)/i, type: 'risk_analysis' },
  { re: /scenario|what\s+if/i, type: 'scenario_analysis' },
];

export function classifyQuery(message: string): ClassifyResult {
  const trimmed = message.trim();

  // Check Opus patterns first (override even if haiku matches)
  for (const { re, type } of OPUS_PATTERNS) {
    if (re.test(trimmed)) {
      return { tier: 'opus', queryType: type };
    }
  }

  // Check Haiku patterns
  for (const { re, type } of HAIKU_PATTERNS) {
    if (re.test(trimmed)) {
      return { tier: 'haiku', queryType: type };
    }
  }

  // Default to Sonnet for everything else
  return { tier: 'sonnet', queryType: 'general' };
}
