import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserModules } from '@/lib/modules/access';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const modules = await getUserModules(session.user.id, session.user.role);
  return NextResponse.json({ modules });
}
