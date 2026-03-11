import { NextResponse } from 'next/server';
import { generateBriefing } from '@/lib/briefing';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const session = await auth(); // TODO: migrate to requireRole()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const briefing = await generateBriefing(session.user.id, session.user.role);
    return NextResponse.json(briefing);
  } catch (error) {
    logger.error({ err: error }, 'Briefing generation failed');
    return NextResponse.json(
      { error: 'Failed to generate briefing' },
      { status: 500 }
    );
  }
}
