import { NextResponse } from 'next/server';
import { generateBriefing } from '@/lib/briefing';
import { auth } from '@/lib/auth';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const briefing = await generateBriefing(session.user.id, session.user.role);
    return NextResponse.json(briefing);
  } catch (error) {
    console.error('Briefing error:', error);
    return NextResponse.json(
      { error: 'Failed to generate briefing' },
      { status: 500 }
    );
  }
}
