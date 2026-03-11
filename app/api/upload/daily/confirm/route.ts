import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';
import { analyzeMetrics } from '@/lib/ai-analysis';
import { auth } from '@/lib/auth';
import { parseBody, withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

const confirmSchema = z.object({
  date: z.string().min(1),
  records: z.array(z.record(z.string(), z.unknown())),
  filename: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await auth(); // TODO: migrate to requireRole()
  const userId = session?.user?.id || 'system';

  const { data, error } = await parseBody(request, confirmSchema);
  if (error) return error;

  const { date, records, filename } = data!;

  const result = await transaction(async (client) => {
    const existing = await client.query('SELECT id FROM daily_uploads WHERE report_date = $1', [date]);
    let duplicateWarning = false;

    if (existing.rows.length > 0) {
      await client.query('DELETE FROM daily_metric_values WHERE upload_id = $1', [existing.rows[0].id]);
      await client.query('DELETE FROM daily_uploads WHERE id = $1', [existing.rows[0].id]);
      duplicateWarning = true;
    }

    const uploadResult = await client.query(
      `INSERT INTO daily_uploads (report_date, filename, uploaded_by, record_count, status)
       VALUES ($1, $2, $3, $4, 'confirmed') RETURNING id`,
      [date, filename, userId, records.length]
    );
    const uploadId = uploadResult.rows[0].id;

    for (const record of records) {
      if ((record as Record<string, unknown>).value_type === 'empty') continue;
      const r = record as Record<string, unknown>;
      await client.query(
        `INSERT INTO daily_metric_values (upload_id, report_date, row_number, metric_name, category, subcategory, agency, unit, raw_value, numeric_value, value_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [uploadId, date, r.row, r.metric_name, r.category, r.subcategory, r.agency, r.unit, r.raw_value?.toString(), r.numeric_value, r.value_type]
      );
    }

    return { uploadId, duplicateWarning };
  });

  await auditService.log({ userId, action: 'DAILY_UPLOAD', entityType: 'daily_uploads', entityId: result.uploadId, newValues: { date, filename, recordCount: records.length }, request });

  analyzeMetrics(records, date).then(async (analysis) => {
    if (analysis.success) {
      try {
        await query(
          `INSERT INTO daily_upload_analysis (upload_id, report_date, executive_summary, anomalies, attention_items, agency_summaries, model, processing_time_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [result.uploadId, date, analysis.analysis?.executive_summary, JSON.stringify(analysis.analysis?.anomalies), JSON.stringify(analysis.analysis?.attention_items), JSON.stringify(analysis.analysis?.agency_summaries), analysis.meta?.model, analysis.meta?.processingTimeMs]
        );
      } catch (err: unknown) {
        logger.error({ err, uploadId: result.uploadId, date }, 'Failed to save daily upload analysis');
      }
    }
  }).catch((err: Error) => logger.error({ err, uploadId: result.uploadId, date }, 'Daily upload AI analysis failed'));

  return NextResponse.json({
    success: true,
    data: { uploadId: result.uploadId, date, recordCount: records.length, duplicateWarning: result.duplicateWarning },
  });
});
