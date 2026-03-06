import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { executeAction } from '@/lib/ai/tools';
import { invalidateContextCache } from '@/lib/ai/context-engine';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tool_name, tool_input } = await request.json();

    if (!tool_name || !tool_input) {
      return NextResponse.json({ error: 'tool_name and tool_input are required' }, { status: 400 });
    }

    const result = await executeAction(tool_name, tool_input, session.user.id);

    // Invalidate context cache so next AI query sees the new data
    if (result.success) {
      invalidateContextCache();
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[ai/action] Error:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Action execution failed' },
      { status: 500 }
    );
  }
}
