import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';
import { analyzeMetrics } from '@/lib/ai-analysis';

export async function POST(request: NextRequest) {
  try {
    const { date, records, filename } = await request.json();

    if (!date || !records || !Array.isArray(records)) {
      return NextResponse.json({ success: false, error: 'date and records are required' }, { status: 400 });
    }

    const result = await transaction(async (client) => {
      // Check for existing data on this date
      const existing = await client.query('SELECT id FROM daily_uploads WHERE report_date = $1', [date]);
      let duplicateWarning = false;

      if (existing.rows.length > 0) {
        // Delete old data
        await client.query('DELETE FROM daily_metric_values WHERE upload_id = $1', [existing.rows[0].id]);
        await client.query('DELETE FROM daily_uploads WHERE id = $1', [existing.rows[0].id]);
        duplicateWarning = true;
      }

      // Insert upload record
      const uploadResult = await client.query(
        `INSERT INTO daily_uploads (report_date, filename, uploaded_by, record_count, status)
         VALUES ($1, $2, $3, $4, 'confirmed') RETURNING id`,
        [date, filename, 'dg-admin', records.length]
      );
      const uploadId = uploadResult.rows[0].id;

      // Insert metric values
      for (const record of records) {
        if (record.value_type === 'empty') continue;
        await client.query(
          `INSERT INTO daily_metric_values (upload_id, report_date, row_number, metric_name, category, subcategory, agency, unit, raw_value, numeric_value, value_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [uploadId, date, record.row, record.metric_name, record.category, record.subcategory, record.agency, record.unit, record.raw_value?.toString(), record.numeric_value, record.value_type]
        );
      }

      return { uploadId, duplicateWarning };
    });

    await auditService.log({ userId: 'dg-admin', action: 'DAILY_UPLOAD', entityType: 'daily_uploads', entityId: result.uploadId, newValues: { date, filename, recordCount: records.length }, request });

    // Trigger AI analysis async (non-blocking)
    analyzeMetrics(records, date).then(async (analysis) => {
      if (analysis.success) {
        try {
          await query(
            `INSERT INTO daily_upload_analysis (upload_id, report_date, executive_summary, anomalies, attention_items, agency_summaries, model, processing_time_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [result.uploadId, date, analysis.analysis?.executive_summary, JSON.stringify(analysis.analysis?.anomalies), JSON.stringify(analysis.analysis?.attention_items), JSON.stringify(analysis.analysis?.agency_summaries), analysis.meta?.model, analysis.meta?.processingTimeMs]
          );
        } catch (err: any) {
          console.error('[upload/daily] Failed to save analysis:', err.message);
        }
      }
    }).catch(err => console.error('[upload/daily] AI analysis failed:', err.message));

    return NextResponse.json({
      success: true,
      data: { uploadId: result.uploadId, date, recordCount: records.length, duplicateWarning: result.duplicateWarning },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
