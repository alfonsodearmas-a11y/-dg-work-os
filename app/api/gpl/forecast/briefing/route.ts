import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { data, error } = await supabaseAdmin
      .from('gpl_forecast_ai_analysis')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No AI strategic briefing available',
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        executiveBriefing: data.executive_briefing,
        demandOutlook: data.demand_outlook,
        capacityRisk: data.capacity_risk,
        infrastructureReliability: data.infrastructure_reliability,
        customerRevenueImpact: data.customer_revenue_impact,
        essequiboAssessment: data.essequibo_assessment,
        recommendations: data.recommendations,
        generatedAt: data.generated_at,
      },
    });
  } catch (error: any) {
    console.error('[gpl-forecast-briefing] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch AI strategic briefing' },
      { status: 500 }
    );
  }
}
