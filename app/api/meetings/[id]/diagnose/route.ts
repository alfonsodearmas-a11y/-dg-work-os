import { NextRequest, NextResponse } from 'next/server';
import { getMinutesById } from '@/lib/meeting-minutes';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Diagnostic endpoint: shows raw Notion blocks for a meeting page
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meeting = await getMinutesById(id);
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const pageId = meeting.notion_meeting_id;

    // Fetch raw blocks from Notion
    const blocks: any[] = [];
    let cursor: string | undefined = undefined;

    do {
      const response: any = await notion.blocks.children.list({
        block_id: pageId,
        start_cursor: cursor,
        page_size: 100,
      });

      for (const block of response.results) {
        const entry: any = {
          id: block.id,
          type: block.type,
          has_children: block.has_children,
          content: block[block.type] || null,
        };

        // If this block has children, try to fetch them too
        if (block.has_children) {
          try {
            const childResponse: any = await notion.blocks.children.list({
              block_id: block.id,
              page_size: 100,
            });
            entry.children = childResponse.results.map((child: any) => ({
              id: child.id,
              type: child.type,
              has_children: child.has_children,
              content: child[child.type] || null,
              rich_text_preview: child[child.type]?.rich_text
                ? child[child.type].rich_text.map((t: any) => t.plain_text || '').join('').slice(0, 200)
                : null,
            }));
            entry.children_count = childResponse.results.length;
            entry.children_has_more = childResponse.has_more;
          } catch (childErr: any) {
            entry.children_error = childErr.message || 'Failed to fetch children';
          }
        }

        blocks.push(entry);
      }

      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    // Summary
    const typeCounts: Record<string, number> = {};
    for (const b of blocks) {
      typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
    }

    return NextResponse.json({
      meeting_title: meeting.title,
      notion_page_id: pageId,
      stored_transcript_length: meeting.raw_transcript?.length || 0,
      stored_transcript_preview: meeting.raw_transcript?.slice(0, 500) || null,
      block_count: blocks.length,
      block_type_counts: typeCounts,
      blocks,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Diagnosis failed' },
      { status: 500 }
    );
  }
}
