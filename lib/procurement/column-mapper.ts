// ── Types ────────────────────────────────────────────────────────────────────

export interface ColumnMapping {
  sourceHeader: string;
  targetField: string | null;
  confidence: 'high' | 'medium' | 'low';
}

// ── Mapping Rules ────────────────────────────────────────────────────────────

type Confidence = ColumnMapping['confidence'];

interface Rule {
  target: string | null;
  confidence: Confidence;
  patterns: string[];
}

const RULES: Rule[] = [
  // Skip columns (sequential numbers)
  {
    target: null,
    confidence: 'high',
    patterns: ['no', 'no.', '#', 's/n', 'sn', 's.n', 'item no', 'item #'],
  },
  {
    target: 'bid_reference',
    confidence: 'high',
    patterns: [
      'bid id', 'bid id#', 'reference', 'ref', 'bid reference',
      'bid no', 'bid number', 'bid ref', 'icb no', 'ncb no',
    ],
  },
  {
    target: 'title',
    confidence: 'high',
    patterns: [
      'description', 'project', 'package', 'project description',
      'scope', 'title', 'package description', 'scope of works',
      'name', 'works description',
    ],
  },
  {
    target: 'opening_date',
    confidence: 'medium',
    patterns: [
      'date of opening', 'opening date', 'bid opening', 'open date',
      'date opened', 'opening',
    ],
  },
  {
    target: 'notes',
    confidence: 'high',
    patterns: ['remarks', 'notes', 'comments', 'status notes', 'remark'],
  },
  {
    target: 'estimated_value',
    confidence: 'medium',
    patterns: [
      'estimated value', 'value', 'amount', 'cost', 'estimate',
      'contract value', 'estimated cost', 'engineer estimate',
      'engineers estimate', "engineer's estimate",
    ],
  },
  {
    target: 'tender_board',
    confidence: 'medium',
    patterns: ['tender board', 'board', 'nptab/rptab', 'nptab', 'rptab'],
  },
  {
    target: 'procurement_method',
    confidence: 'low',
    patterns: [
      'method', 'procurement method', 'type', 'bid type',
      'procurement type', 'tender type',
    ],
  },
  {
    target: 'expected_delivery_date',
    confidence: 'low',
    patterns: [
      'delivery date', 'expected delivery', 'completion date',
      'expected completion', 'completion',
    ],
  },
];

// ── Normalizer ───────────────────────────────────────────────────────────────

/** Lowercase, strip punctuation, collapse whitespace */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Mapper ───────────────────────────────────────────────────────────────────

/**
 * Map detected spreadsheet headers to procurement_packages target fields.
 * Returns one mapping per header. Unrecognized headers get targetField: null.
 */
export function mapColumns(headers: string[]): ColumnMapping[] {
  const usedTargets = new Set<string | null>();

  return headers.map((header) => {
    const norm = normalize(header);

    for (const rule of RULES) {
      // Skip targets already assigned (except null — multiple columns can be skipped)
      if (rule.target !== null && usedTargets.has(rule.target)) continue;

      for (const pattern of rule.patterns) {
        if (norm === pattern || norm.includes(pattern)) {
          if (rule.target !== null) usedTargets.add(rule.target);
          return {
            sourceHeader: header,
            targetField: rule.target,
            confidence: rule.confidence,
          };
        }
      }
    }

    return { sourceHeader: header, targetField: null, confidence: 'low' as const };
  });
}
