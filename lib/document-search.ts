import { supabaseAdmin } from './db';

export async function searchDocuments(query: string, filters?: {
  agency?: string;
  document_type?: string;
  date_from?: string;
  date_to?: string;
}) {
  let dbQuery = supabaseAdmin
    .from('documents')
    .select('*');

  // Apply text search if query provided
  if (query) {
    dbQuery = dbQuery.or(`title.ilike.%${query}%,summary.ilike.%${query}%`);
  }

  if (filters?.agency) {
    dbQuery = dbQuery.eq('agency', filters.agency);
  }

  if (filters?.document_type) {
    dbQuery = dbQuery.eq('document_type', filters.document_type);
  }

  if (filters?.date_from) {
    dbQuery = dbQuery.gte('document_date', filters.date_from);
  }

  if (filters?.date_to) {
    dbQuery = dbQuery.lte('document_date', filters.date_to);
  }

  const { data, error } = await dbQuery
    .order('uploaded_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data;
}

// Search within a specific document's chunks
export async function searchWithinDocument(
  documentId: string,
  query: string
) {
  const { data, error } = await supabaseAdmin
    .from('document_chunks')
    .select('*')
    .eq('document_id', documentId)
    .ilike('content', `%${query}%`)
    .limit(10);

  if (error) throw error;
  return data;
}
