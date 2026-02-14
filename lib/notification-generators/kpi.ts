import { insertNotification } from '../notifications';
import type { Notification, GenerateResult } from '../notifications';
import { query } from '../db-pg';

export async function generateKpiNotifications(userId: string): Promise<GenerateResult> {
  const created: Notification[] = [];
  const today = new Date();
  const morningSlot = `${today.toISOString().split('T')[0]}T08:00:00.000Z`;

  try {
    // 1. Bridge active alerts → kpi_threshold_breach notifications
    const activeAlerts = await query(
      `SELECT id, agency, severity, metric_name, current_value, threshold_value, message
       FROM alerts WHERE is_active = true ORDER BY created_at DESC LIMIT 20`
    );

    for (const alert of activeAlerts.rows) {
      const priority = alert.severity === 'critical' ? 'urgent' as const
        : alert.severity === 'warning' ? 'high' as const
        : 'medium' as const;

      const inserted = await insertNotification({
        user_id: userId,
        type: 'kpi_threshold_breach',
        title: `${alert.agency} alert: ${alert.metric_name}`,
        body: alert.message,
        icon: 'kpi',
        priority,
        reference_type: 'kpi',
        reference_id: alert.id,
        reference_url: `/intel/${alert.agency.toLowerCase()}`,
        scheduled_for: morningSlot,
        category: 'kpi',
        source_module: 'kpi',
        action_required: alert.severity === 'critical',
        action_type: alert.severity === 'critical' ? 'acknowledge' : null,
        metadata: {
          agency: alert.agency,
          severity: alert.severity,
          metric_name: alert.metric_name,
          current_value: alert.current_value,
          threshold_value: alert.threshold_value,
        },
      });
      if (inserted) created.push(inserted);
    }

    // 2. Check each agency for stale data (>2 days since last approved entry)
    const agencies = [
      { name: 'GPL', table: 'gpl_daily_summaries', dateCol: 'report_date' },
      { name: 'CJIA', table: 'cjia_metrics', dateCol: 'date' },
      { name: 'GWI', table: 'gwi_metrics', dateCol: 'date' },
    ];

    for (const ag of agencies) {
      try {
        const result = await query(
          `SELECT MAX(${ag.dateCol}) as last_date FROM ${ag.table}`
        );
        const lastDate = result.rows[0]?.last_date;
        if (!lastDate) continue;

        const daysSince = Math.floor((today.getTime() - new Date(lastDate).getTime()) / (24 * 60 * 60 * 1000));
        if (daysSince <= 2) continue;

        const inserted = await insertNotification({
          user_id: userId,
          type: 'kpi_data_stale',
          title: `${ag.name} data is ${daysSince} days old`,
          body: `Last data entry was ${new Date(lastDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Data entry may be needed.`,
          icon: 'kpi',
          priority: daysSince > 5 ? 'high' : 'medium',
          reference_type: 'kpi',
          reference_id: `stale-${ag.name.toLowerCase()}`,
          reference_url: `/intel/${ag.name.toLowerCase()}`,
          scheduled_for: morningSlot,
          category: 'kpi',
          source_module: 'kpi',
          action_required: true,
          action_type: 'review',
          metadata: {
            agency: ag.name,
            days_since_last: daysSince,
            last_date: lastDate,
          },
        });
        if (inserted) created.push(inserted);
      } catch {
        // Table may not exist yet — skip silently
      }
    }
  } catch (err) {
    console.error('Error generating KPI notifications:', err);
  }

  return { count: created.length, notifications: created };
}
