import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Trello API types
// ---------------------------------------------------------------------------

export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  url: string;
  shortUrl: string;
  closed: boolean;
}

export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  pos: number;
}

export interface TrelloLabel {
  id: string;
  name: string;
  color: string | null;
}

export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  idList: string;
  dateLastActivity: string;
  due: string | null;
  labels: TrelloLabel[];
  shortUrl: string;
  attachments?: TrelloAttachment[];
}

export interface TrelloWebhook {
  id: string;
  description: string;
  idModel: string;
  callbackURL: string;
  active: boolean;
}

// Webhook event payload
export interface TrelloWebhookAction {
  type: string;
  data: {
    card?: {
      id: string;
      name: string;
      idList: string;
      desc?: string;
      due?: string | null;
      shortUrl?: string;
    };
    list?: { id: string; name: string };
    listBefore?: { id: string; name: string };
    listAfter?: { id: string; name: string };
    board: { id: string; name?: string };
  };
}

export interface TrelloWebhookPayload {
  action: TrelloWebhookAction;
}

// ---------------------------------------------------------------------------
// Stage mapping
// ---------------------------------------------------------------------------

// Trello list names map to the unified tender_stage enum (§5 of plan).
export type TenderStage =
  | 'design'
  | 'advertised'
  | 'evaluation'
  | 'awaiting_award'
  | 'award';

const STAGE_MAP: Record<string, TenderStage> = {
  'not advertised': 'design',
  'design': 'design',
  'advertised': 'advertised',
  'evaluation': 'evaluation',
  'nptab/cabinet no objection request': 'awaiting_award',
  'nptab': 'awaiting_award',
  'awaiting award': 'awaiting_award',
  'contract awarded': 'award',
  'award': 'award',
};

/** Map a Trello list name to a tender stage. Falls back to 'design'. */
export function mapListNameToStage(listName: string): TenderStage {
  const normalized = listName.trim().toLowerCase();
  const stage = STAGE_MAP[normalized];
  if (!stage) {
    logger.warn({ listName }, 'Trello list name did not match any known stage — defaulting to design');
    return 'design';
  }
  return stage;
}

/** Build a list_mapping object from Trello lists: { trello_list_id: stage } */
export function buildListMapping(lists: TrelloList[]): Record<string, TenderStage> {
  const mapping: Record<string, TenderStage> = {};
  for (const list of lists) {
    if (!list.closed) {
      mapping[list.id] = mapListNameToStage(list.name);
    }
  }
  return mapping;
}

/** Resolve a Trello list ID to a stage using a pre-built mapping */
export function resolveStage(
  listId: string,
  listMapping: Record<string, TenderStage>,
): TenderStage {
  return listMapping[listId] ?? 'design';
}

// ---------------------------------------------------------------------------
// Trello API client
// ---------------------------------------------------------------------------

const TRELLO_BASE = 'https://api.trello.com';

function authParams(): URLSearchParams {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) {
    throw new Error('TRELLO_API_KEY and TRELLO_TOKEN must be set');
  }
  return new URLSearchParams({ key, token });
}

async function trelloFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, TRELLO_BASE);
  // Merge auth params into existing search params
  const auth = authParams();
  auth.forEach((value, key) => url.searchParams.set(key, value));

  const res = await fetch(url.toString(), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Trello API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export const trello = {
  /** GET /1/boards/{id} */
  getBoard(boardId: string): Promise<TrelloBoard> {
    return trelloFetch<TrelloBoard>(`/1/boards/${boardId}`);
  },

  /** GET /1/boards/{id}/lists */
  getBoardLists(boardId: string): Promise<TrelloList[]> {
    return trelloFetch<TrelloList[]>(`/1/boards/${boardId}/lists`);
  },

  /** GET /1/boards/{id}/cards with attachments */
  getBoardCards(boardId: string): Promise<TrelloCard[]> {
    const params = new URLSearchParams({
      fields: 'name,desc,idList,dateLastActivity,due,labels,shortUrl',
      attachments: 'true',
    });
    return trelloFetch<TrelloCard[]>(`/1/boards/${boardId}/cards?${params}`);
  },

  /** POST /1/webhooks — register a webhook for a board */
  registerWebhook(boardId: string, callbackUrl: string): Promise<TrelloWebhook> {
    const params = new URLSearchParams({
      callbackURL: callbackUrl,
      idModel: boardId,
      description: `DG Work OS sync for board ${boardId}`,
    });
    return trelloFetch<TrelloWebhook>(`/1/webhooks?${params}`, { method: 'POST' });
  },

  /** DELETE /1/webhooks/{id} */
  deleteWebhook(webhookId: string): Promise<void> {
    return trelloFetch<void>(`/1/webhooks/${webhookId}`, { method: 'DELETE' });
  },
};
