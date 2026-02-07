import { MetricSnapshot } from './types';

// ── Local Answer Engine ─────────────────────────────────────────────────────
// Answers ~15 common metric lookups instantly with zero API cost.
// Returns null if the question can't be answered locally.

export interface LocalAnswer {
  text: string;
  suggestions: string[];
}

type PatternHandler = (snapshot: MetricSnapshot) => LocalAnswer | null;

const PATTERNS: Array<{ re: RegExp; handler: PatternHandler }> = [
  // GPL health score
  {
    re: /^(what('s|s| is)|how('s|s| is))\s+(the\s+)?gpl\s+health\s+score/i,
    handler: (s) => ({
      text: `**GPL health score: ${s.gpl.health.score}/10** (${s.gpl.health.label})\n\n${s.gpl.health.breakdown}`,
      suggestions: ['Which GPL stations need attention?', 'What is the reserve margin?', 'Compare all agency health scores'],
    }),
  },
  // GWI health score
  {
    re: /^(what('s|s| is)|how('s|s| is))\s+(the\s+)?gwi\s+health\s+score/i,
    handler: (s) => ({
      text: `**GWI health score: ${s.gwi.health.score}/10** (${s.gwi.health.label})\n\n${s.gwi.health.breakdown}`,
      suggestions: ['What is GWI resolution rate?', 'Show GWI financial summary', 'Compare all agency health scores'],
    }),
  },
  // CJIA health score
  {
    re: /^(what('s|s| is)|how('s|s| is))\s+(the\s+)?cjia\s+health\s+score/i,
    handler: (s) => ({
      text: `**CJIA health score: ${s.cjia.health.score}/10** (${s.cjia.health.label})\n\n${s.cjia.health.breakdown}`,
      suggestions: ['How many passengers this month?', 'What is CJIA on-time performance?', 'Compare all agency health scores'],
    }),
  },
  // GCAA health score
  {
    re: /^(what('s|s| is)|how('s|s| is))\s+(the\s+)?gcaa\s+health\s+score/i,
    handler: (s) => ({
      text: `**GCAA health score: ${s.gcaa.health.score}/10** (${s.gcaa.health.label})\n\n${s.gcaa.health.breakdown}`,
      suggestions: ['What is the compliance rate?', 'How many incidents this month?', 'Compare all agency health scores'],
    }),
  },
  // All health scores
  {
    re: /(all|every)\s+(agency\s+)?health\s+score/i,
    handler: (s) => ({
      text: `## Agency Health Scores\n\n- **GPL:** ${s.gpl.health.score}/10 (${s.gpl.health.label}) — ${s.gpl.health.breakdown}\n- **GWI:** ${s.gwi.health.score}/10 (${s.gwi.health.label}) — ${s.gwi.health.breakdown}\n- **CJIA:** ${s.cjia.health.score}/10 (${s.cjia.health.label}) — ${s.cjia.health.breakdown}\n- **GCAA:** ${s.gcaa.health.score}/10 (${s.gcaa.health.label}) — ${s.gcaa.health.breakdown}`,
      suggestions: ['Which agency needs the most attention?', 'Show GPL station details', 'Show delayed projects'],
    }),
  },
  // Reserve margin / capacity
  {
    re: /(what('s|s| is)|how much)\s+(the\s+)?(current\s+)?(reserve|reserve margin|spare capacity)/i,
    handler: (s) => {
      if (s.gpl.reserve_mw == null) return null;
      return {
        text: `**GPL reserve capacity: ${s.gpl.reserve_mw.toFixed(1)} MW**\n\nCapacity: ${s.gpl.capacity_mw?.toFixed(1) ?? 'N/A'} MW | Peak demand: ${s.gpl.peak_demand_mw?.toFixed(1) ?? 'N/A'} MW`,
        suggestions: ['Is this reserve adequate?', 'Which stations are offline?', 'What is suppressed demand?'],
      };
    },
  },
  // Peak demand
  {
    re: /(what('s|s| is))\s+(the\s+)?(current\s+)?(peak\s+demand|expected\s+peak)/i,
    handler: (s) => {
      if (s.gpl.peak_demand_mw == null) return null;
      return {
        text: `**Expected peak demand: ${s.gpl.peak_demand_mw.toFixed(1)} MW**\n\nCapacity: ${s.gpl.capacity_mw?.toFixed(1) ?? 'N/A'} MW | Reserve: ${s.gpl.reserve_mw?.toFixed(1) ?? 'N/A'} MW`,
        suggestions: ['What is the reserve margin?', 'How much suppressed demand?', 'GPL station status'],
      };
    },
  },
  // Suppressed demand
  {
    re: /(what('s|s| is))\s+(the\s+)?(current\s+)?suppressed\s+(demand|mw|load)/i,
    handler: (s) => {
      if (s.gpl.suppressed_mw == null) return null;
      return {
        text: s.gpl.suppressed_mw === 0
          ? '**No suppressed demand currently.** All load is being served.'
          : `**Suppressed demand: ${s.gpl.suppressed_mw.toFixed(1)} MW**\n\nThis means some areas may be experiencing load shedding.`,
        suggestions: ['What is causing load shedding?', 'Which stations are offline?', 'GPL health score'],
      };
    },
  },
  // Units online
  {
    re: /how\s+many\s+(generation\s+)?units?\s+(are\s+)?(online|available|running)/i,
    handler: (s) => {
      if (s.gpl.units_online == null) return null;
      return {
        text: `**${s.gpl.units_online} of ${s.gpl.units_total} generation units online**`,
        suggestions: ['Which stations have units offline?', 'What is total capacity?', 'GPL health score'],
      };
    },
  },
  // How many projects / total projects
  {
    re: /how\s+many\s+(total\s+)?projects/i,
    handler: (s) => ({
      text: `**${s.projects.total} total projects** — ${s.projects.in_progress} in progress, ${s.projects.delayed} delayed, ${s.projects.complete} complete, ${s.projects.not_started} not started\n\nTotal portfolio value: **$${(s.projects.total_value / 1e6).toFixed(0)}M**`,
      suggestions: ['Which delayed projects are most critical?', 'Summarize projects by agency', 'What is total delayed project value?'],
    }),
  },
  // Delayed projects count
  {
    re: /how\s+many\s+(projects?\s+)?(are\s+)?delayed/i,
    handler: (s) => ({
      text: `**${s.projects.delayed} projects are delayed** out of ${s.projects.total} total projects.`,
      suggestions: ['Which delayed projects are most critical?', 'Show projects by region', 'Compare agency project execution'],
    }),
  },
  // Overdue tasks
  {
    re: /how\s+many\s+(tasks?\s+)?(are\s+)?overdue/i,
    handler: (s) => ({
      text: `**${s.tasks.overdue} overdue tasks** out of ${s.tasks.active} active tasks. ${s.tasks.due_today} due today.`,
      suggestions: ['Show me my overdue tasks', 'What needs my attention today?', 'Tasks by agency'],
    }),
  },
  // Calendar today count
  {
    re: /how\s+many\s+(events?|meetings?)\s+(do i have\s+)?(today|on the calendar)/i,
    handler: (s) => {
      // Snapshot doesn't include calendar detail — just the count from tasks
      return null; // Let the AI handle this since snapshot may not have today's events
    },
  },
  // GWI resolution rate
  {
    re: /(what('s|s| is))\s+(the\s+)?(gwi\s+)?resolution\s+rate/i,
    handler: (s) => {
      if (s.gwi.resolution_rate_pct == null) return null;
      return {
        text: `**GWI complaint resolution rate: ${s.gwi.resolution_rate_pct.toFixed(1)}%**`,
        suggestions: ['Is GWI resolution improving?', 'How many GWI complaints?', 'GWI health score'],
      };
    },
  },
  // GCAA compliance rate
  {
    re: /(what('s|s| is))\s+(the\s+)?(gcaa\s+)?compliance\s+rate/i,
    handler: (s) => {
      if (s.gcaa.compliance_rate_pct == null) return null;
      return {
        text: `**GCAA compliance rate: ${s.gcaa.compliance_rate_pct.toFixed(1)}%**`,
        suggestions: ['How many inspections completed?', 'Any aviation incidents?', 'GCAA health score'],
      };
    },
  },
];

// ── Main Entry Point ────────────────────────────────────────────────────────

export function tryLocalAnswer(message: string, snapshot: MetricSnapshot | null): LocalAnswer | null {
  if (!snapshot) return null;

  const trimmed = message.trim();

  for (const { re, handler } of PATTERNS) {
    if (re.test(trimmed)) {
      const result = handler(snapshot);
      if (result) return result;
    }
  }

  return null;
}
