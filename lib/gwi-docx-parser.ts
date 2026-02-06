/**
 * GWI DOCX Parser
 *
 * Extracts raw text from .docx files using mammoth.
 * Detects report type from content heuristics.
 */

import mammoth from 'mammoth';

export type GWIReportType = 'management' | 'cscr' | 'procurement';

export interface DocxParseResult {
  text: string;
  detectedType: GWIReportType;
  confidence: number;
  wordCount: number;
}

/**
 * Extract raw text from a .docx buffer
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Detect report type from extracted text
 */
export function detectReportType(text: string): { type: GWIReportType; confidence: number } {
  const lower = text.toLowerCase();

  // Score each report type based on keyword presence
  const scores: Record<GWIReportType, number> = {
    management: 0,
    cscr: 0,
    procurement: 0,
  };

  // Management report keywords
  const managementKeywords = [
    'net profit', 'total revenue', 'operating cost', 'balance sheet',
    'subvention', 'tariff revenue', 'depreciation', 'net assets',
    'cash at bank', 'employment cost', 'financial performance',
    'income statement', 'management report',
  ];
  for (const kw of managementKeywords) {
    if (lower.includes(kw)) scores.management += 1;
  }

  // CSCR (Customer Service and Collections Report) keywords
  const cscrKeywords = [
    'complaint', 'collection', 'billing', 'disconnection', 'reconnection',
    'customer service', 'accounts receivable', 'arrears', 'active accounts',
    'resolution rate', 'cscr', 'board report', 'on-time payment',
  ];
  for (const kw of cscrKeywords) {
    if (lower.includes(kw)) scores.cscr += 1;
  }

  // Procurement keywords
  const procurementKeywords = [
    'procurement', 'contract', 'purchase', 'inventory', 'tender',
    'gog funded', 'gwi funded', 'major contract', 'minor contract',
    'supplies', 'receipts', 'issues',
  ];
  for (const kw of procurementKeywords) {
    if (lower.includes(kw)) scores.procurement += 1;
  }

  const entries = Object.entries(scores) as [GWIReportType, number][];
  entries.sort((a, b) => b[1] - a[1]);

  const [bestType, bestScore] = entries[0];
  const totalScore = entries.reduce((sum, [, s]) => sum + s, 0);
  const confidence = totalScore > 0 ? bestScore / totalScore : 0;

  return { type: bestType, confidence };
}

/**
 * Parse a .docx buffer and return text + detected type
 */
export async function parseGWIDocx(buffer: Buffer): Promise<DocxParseResult> {
  const text = await extractDocxText(buffer);
  const { type, confidence } = detectReportType(text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    text,
    detectedType: type,
    confidence,
    wordCount,
  };
}
