import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export interface Task {
  notion_id: string;
  title: string;
  status: 'To Do' | 'In Progress' | 'Waiting' | 'Done';
  due_date: string | null;
  assignee: string | null;
  assignee_id: string | null;
  agency: string | null;
  role: string | null;
  priority: 'High' | 'Medium' | 'Low' | null;
  created_at: string;
  url: string;
}

export interface TaskUpdate {
  title?: string;
  status?: 'To Do' | 'In Progress' | 'Waiting' | 'Done';
  due_date?: string | null;
  agency?: string | null;
  role?: string | null;
  priority?: 'High' | 'Medium' | 'Low' | null;
}

export interface TaskCreate {
  title: string;
  status?: 'To Do' | 'In Progress' | 'Waiting' | 'Done';
  due_date?: string | null;
  agency?: string | null;
  role?: string | null;
  priority?: 'High' | 'Medium' | 'Low' | null;
  description?: string | null;
}

export interface Meeting {
  notion_id: string;
  title: string;
  meeting_date: string | null;
  attendees: string[];
  summary: string | null;
  category: string | null;
}

// Fetch all tasks from Actions database (including Done)
export async function fetchAllTasks(): Promise<Task[]> {
  const response = await notion.databases.query({
    database_id: process.env.NOTION_TASKS_DATABASE_ID!,
    sorts: [
      {
        property: 'Due',
        direction: 'ascending'
      }
    ]
  });

  return response.results.map((page: any) => parseTaskPage(page));
}

// Fetch tasks excluding Done (for briefing)
export async function fetchTasks(): Promise<Task[]> {
  const response = await notion.databases.query({
    database_id: process.env.NOTION_TASKS_DATABASE_ID!,
    filter: {
      property: 'Status',
      status: {
        does_not_equal: 'Done'
      }
    },
    sorts: [
      {
        property: 'Due',
        direction: 'ascending'
      }
    ]
  });

  return response.results.map((page: any) => parseTaskPage(page));
}

// Parse Notion page to task object
function parseTaskPage(page: any): Task {
  const props = page.properties;

  // Get status and normalize it
  let status = props['Status']?.status?.name || 'To Do';
  // Map any non-standard statuses
  if (!['To Do', 'In Progress', 'Waiting', 'Done'].includes(status)) {
    status = 'To Do';
  }

  return {
    notion_id: page.id,
    title: props['Action']?.title?.[0]?.plain_text || 'Untitled',
    status: status as Task['status'],
    due_date: props['Due']?.date?.start || null,
    assignee: props['Assignee']?.people?.[0]?.name || null,
    assignee_id: props['Assignee']?.people?.[0]?.id || null,
    agency: props['Agency']?.select?.name || null,
    role: props['Role']?.select?.name || null,
    priority: props['Priority']?.select?.name as Task['priority'] || null,
    created_at: page.created_time,
    url: page.url
  };
}

// Update a task in Notion
export async function updateTask(pageId: string, updates: TaskUpdate): Promise<Task> {
  const properties: any = {};

  if (updates.title !== undefined) {
    properties['Action'] = {
      title: [{ text: { content: updates.title } }]
    };
  }

  if (updates.status !== undefined) {
    properties['Status'] = { status: { name: updates.status } };
  }

  if (updates.due_date !== undefined) {
    properties['Due'] = updates.due_date
      ? { date: { start: updates.due_date } }
      : { date: null };
  }

  if (updates.agency !== undefined) {
    properties['Agency'] = updates.agency
      ? { select: { name: updates.agency } }
      : { select: null };
  }

  if (updates.role !== undefined) {
    properties['Role'] = updates.role
      ? { select: { name: updates.role } }
      : { select: null };
  }

  if (updates.priority !== undefined) {
    properties['Priority'] = updates.priority
      ? { select: { name: updates.priority } }
      : { select: null };
  }

  const response = await notion.pages.update({
    page_id: pageId,
    properties
  });

  return parseTaskPage(response);
}

// Create a new task in Notion
export async function createTask(task: TaskCreate): Promise<Task> {
  const properties: any = {
    'Action': {
      title: [{ text: { content: task.title } }]
    },
    'Status': {
      status: { name: task.status || 'To Do' }
    }
  };

  if (task.due_date) {
    properties['Due'] = { date: { start: task.due_date } };
  }

  if (task.agency) {
    properties['Agency'] = { select: { name: task.agency } };
  }

  if (task.role) {
    properties['Role'] = { select: { name: task.role } };
  }

  if (task.priority) {
    properties['Priority'] = { select: { name: task.priority } };
  }

  const createParams: any = {
    parent: { database_id: process.env.NOTION_TASKS_DATABASE_ID! },
    properties,
  };

  // Add page body content if description provided
  if (task.description) {
    createParams.children = task.description.split('\n').filter(Boolean).map((line: string) => ({
      object: 'block' as const,
      type: 'paragraph' as const,
      paragraph: {
        rich_text: [{ type: 'text' as const, text: { content: line } }],
      },
    }));
  }

  const response = await notion.pages.create(createParams);

  return parseTaskPage(response);
}

// Archive a task (soft delete)
export async function archiveTask(pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    archived: true
  });
}

// Fetch recent meetings
export async function fetchMeetings(daysBack: number = 30): Promise<Meeting[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const response = await notion.databases.query({
    database_id: process.env.NOTION_MEETINGS_DATABASE_ID!,
    filter: {
      property: 'Date',
      date: {
        on_or_after: since.toISOString().split('T')[0]
      }
    },
    sorts: [
      {
        property: 'Date',
        direction: 'descending'
      }
    ]
  });

  return response.results.map((page: any) => parseMeetingPage(page));
}

function parseMeetingPage(page: any): Meeting {
  const props = page.properties;
  return {
    notion_id: page.id,
    title: props['Meeting name']?.title?.[0]?.plain_text || 'Untitled',
    meeting_date: props['Date']?.date?.start || null,
    attendees: props['Attendees']?.people?.map((p: any) => p.name) || [],
    summary: props['Summary']?.rich_text?.[0]?.plain_text || null,
    category: props['Category']?.multi_select?.[0]?.name || null
  };
}

// Extract rich text content from a Notion rich_text array
function extractRichText(richText: any[]): string {
  if (!richText || !Array.isArray(richText)) return '';
  return richText.map((t: any) => t.plain_text || '').join('');
}

// Convert a single Notion block to plain text
function blockToText(block: any): string {
  const type = block.type;
  switch (type) {
    case 'paragraph':
      return extractRichText(block.paragraph?.rich_text);
    case 'heading_1':
      return `# ${extractRichText(block.heading_1?.rich_text)}`;
    case 'heading_2':
      return `## ${extractRichText(block.heading_2?.rich_text)}`;
    case 'heading_3':
      return `### ${extractRichText(block.heading_3?.rich_text)}`;
    case 'bulleted_list_item':
      return `- ${extractRichText(block.bulleted_list_item?.rich_text)}`;
    case 'numbered_list_item':
      return `1. ${extractRichText(block.numbered_list_item?.rich_text)}`;
    case 'to_do': {
      const checked = block.to_do?.checked ? '[x]' : '[ ]';
      return `- ${checked} ${extractRichText(block.to_do?.rich_text)}`;
    }
    case 'toggle':
      return `> ${extractRichText(block.toggle?.rich_text)}`;
    case 'code':
      return `\`\`\`${block.code?.language || ''}\n${extractRichText(block.code?.rich_text)}\n\`\`\``;
    case 'callout':
      return `> ${extractRichText(block.callout?.rich_text)}`;
    case 'quote':
      return `> ${extractRichText(block.quote?.rich_text)}`;
    case 'divider':
      return '---';
    case 'table_row':
      return (block.table_row?.cells || [])
        .map((cell: any[]) => extractRichText(cell))
        .join(' | ');
    default:
      return '';
  }
}

// Fetch all blocks (page body) from a Notion page and convert to plain text.
// Returns { text, unsupportedTypes } — unsupportedTypes lists block types that
// had children we couldn't access (e.g. Notion's "transcription" blocks).
export async function fetchPageBlocks(pageId: string, _depth = 0): Promise<{ text: string; unsupportedTypes: string[] }> {
  const lines: string[] = [];
  const unsupportedTypes: string[] = [];
  let cursor: string | undefined = undefined;

  do {
    const response: any = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      const text = blockToText(block);
      if (text) lines.push(text);

      // Recursively fetch children if the block has them
      if (block.has_children && block.type !== 'child_page' && block.type !== 'child_database') {
        try {
          const child = await fetchPageBlocks(block.id, _depth + 1);
          if (child.text) {
            const indented = child.text.split('\n').map((l: string) => `  ${l}`).join('\n');
            lines.push(indented);
          }
          unsupportedTypes.push(...child.unsupportedTypes);
        } catch (err: any) {
          // Notion API returns specific errors for unsupported block types
          const msg: string = err?.message || '';
          const typeMatch = msg.match(/Block type (\w+) is not supported/);
          if (typeMatch) {
            unsupportedTypes.push(typeMatch[1]);
            console.warn(`[notion] Block type "${typeMatch[1]}" is not supported via the API (block ${block.id})`);
          } else {
            console.warn(`[notion] Failed to fetch children of block ${block.id} (type: ${block.type}): ${msg}`);
          }
        }
      }
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return { text: lines.join('\n'), unsupportedTypes };
}
