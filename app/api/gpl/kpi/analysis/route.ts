import { NextResponse } from 'next/server';

// KPI analysis is not yet stored in Supabase — return empty for now.
// When AI analysis is triggered after upload, it will be saved here.
export async function GET() {
  return NextResponse.json({
    success: true,
    hasAnalysis: false,
    message: 'No KPI analysis available',
  });
}
