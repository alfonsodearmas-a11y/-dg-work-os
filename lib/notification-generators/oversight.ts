import { readFile } from 'fs/promises';
import { join } from 'path';
import { insertNotification } from '../notifications';
import type { Notification, GenerateResult } from '../notifications';

interface OversightProject {
  p3Id: string;
  projectReference?: string;
  projectName?: string;
  executingAgency?: string;
  subAgency?: string;
  contractValue?: number | null;
  contractValueRaw?: string;
  completionPercent?: number | null;
  daysOverdue?: number;
  daysRemaining?: number;
  risk?: string;
}

interface OversightData {
  metadata: { generatedAt: string };
  summary: {
    delayed: number;
    overdue: number;
    endingSoon: number;
    atRisk: number;
  };
  overdue: OversightProject[];
  atRisk: OversightProject[];
  endingSoon: OversightProject[];
}

function formatValue(val: number | null | undefined): string {
  if (!val) return 'N/A';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  return `$${val.toLocaleString()}`;
}

export async function generateOversightNotifications(userId: string): Promise<GenerateResult> {
  const created: Notification[] = [];
  const today = new Date();
  const morningSlot = `${today.toISOString().split('T')[0]}T08:00:00.000Z`;

  try {
    const filePath = join(process.cwd(), 'scraper/output/oversight-highlights-latest.json');
    const raw = await readFile(filePath, 'utf-8');
    const data: OversightData = JSON.parse(raw);

    // Only generate if scrape data is fresh (<48 hours)
    const scrapeAge = today.getTime() - new Date(data.metadata.generatedAt).getTime();
    if (scrapeAge > 48 * 60 * 60 * 1000) return { count: 0, notifications: [] };

    const { summary } = data;

    // 1. Oversight summary notification
    if (summary.overdue > 0 || summary.atRisk > 0 || summary.endingSoon > 0) {
      const parts: string[] = [];
      if (summary.overdue > 0) parts.push(`${summary.overdue} overdue`);
      if (summary.atRisk > 0) parts.push(`${summary.atRisk} at risk`);
      if (summary.endingSoon > 0) parts.push(`${summary.endingSoon} ending soon`);

      const inserted = await insertNotification({
        user_id: userId,
        type: 'oversight_overdue_summary',
        title: `Oversight: ${parts.join(', ')}`,
        body: `${data.overdue.length + data.atRisk.length + data.endingSoon.length} projects need attention across the portfolio`,
        icon: 'oversight',
        priority: summary.overdue > 10 ? 'high' : 'medium',
        reference_type: 'oversight',
        reference_id: `oversight-summary-${today.toISOString().split('T')[0]}`,
        reference_url: '/projects',
        scheduled_for: morningSlot,
        category: 'oversight',
        source_module: 'oversight',
        action_required: true,
        action_type: 'review',
        metadata: {
          overdue_count: summary.overdue,
          at_risk_count: summary.atRisk,
          ending_soon_count: summary.endingSoon,
          scrape_date: data.metadata.generatedAt,
        },
      });
      if (inserted) created.push(inserted);
    }

    // 2. Individual at-risk alerts for high-value projects (>$1B, max 3)
    const highValueAtRisk = data.atRisk
      .filter(p => p.contractValue && p.contractValue > 1_000_000_000)
      .slice(0, 3);

    for (const p of highValueAtRisk) {
      const inserted = await insertNotification({
        user_id: userId,
        type: 'oversight_at_risk',
        title: `At risk: ${p.projectName || 'Unnamed project'}`,
        body: `${p.subAgency || p.executingAgency || 'Unknown'} — ${formatValue(p.contractValue)} — ${p.daysRemaining ?? '?'} days remaining`,
        icon: 'oversight',
        priority: 'high',
        reference_type: 'oversight',
        reference_id: `oversight-${p.p3Id}`,
        reference_url: '/projects',
        scheduled_for: morningSlot,
        category: 'oversight',
        source_module: 'oversight',
        action_required: false,
        metadata: {
          p3_id: p.p3Id,
          project_name: p.projectName,
          agency: p.subAgency || p.executingAgency,
          contract_value: p.contractValue,
          days_remaining: p.daysRemaining,
          risk: p.risk,
        },
      });
      if (inserted) created.push(inserted);
    }
  } catch (err) {
    // File may not exist yet or be malformed — skip silently
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Error generating oversight notifications:', err);
    }
  }

  return { count: created.length, notifications: created };
}
