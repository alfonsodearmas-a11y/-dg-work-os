import { supabaseAdmin } from '@/lib/db';
import { AGENCY_NAMES } from '@/lib/constants/agencies';
import type {
  ProcurementPackage,
  ProcurementStageHistory,
  ProcurementDocument,
  ProcurementNote,
  ProcurementStage,
  ProcurementMethod,
  PipelineStats,
} from '@/lib/procurement-types';
import { PROCUREMENT_STAGES } from '@/lib/procurement-types';

// ── Constants ─────────────────────────────────────────────────────────────

const PACKAGE_COLUMNS = 'id, agency, title, description, estimated_value, procurement_method, current_stage, submitted_by, oversight_project_id, expected_delivery_date, created_at, updated_at';

const PACKAGE_SELECT = `${PACKAGE_COLUMNS}, submitter:users!procurement_packages_submitted_by_fkey(name), latest_history:procurement_stage_history(changed_at)`;

const STALLED_THRESHOLD_DAYS = 30;

// ── Helpers ───────────────────────────────────────────────────────────────

/** Unwrap a Supabase FK join result (may be object or single-element array) to a name string. */
function resolveJoinedName(raw: unknown): string {
  const resolved = (Array.isArray(raw) ? raw[0] : raw) as { name: string } | null;
  return resolved?.name || 'Unknown';
}

function agencyName(code: string): string {
  return AGENCY_NAMES[code.toUpperCase()] || code;
}

function computeDaysAtStage(latestChangedAt: string | null, createdAt: string): number {
  const ref = latestChangedAt ? new Date(latestChangedAt) : new Date(createdAt);
  return Math.floor((Date.now() - ref.getTime()) / (1000 * 60 * 60 * 24));
}

/** Sort each row's latest_history array so the most recent entry is first. */
function sortRowHistory(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const history = (row.latest_history as { changed_at: string }[]) || [];
    history.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
    return { ...row, latest_history: history };
  });
}

/**
 * Enrich a raw package row into a typed ProcurementPackage.
 */
function enrichPackage(
  row: Record<string, unknown>,
  submitterName: string,
  latestChangedAt: string | null,
): ProcurementPackage {
  return {
    id: row.id as string,
    agency: row.agency as string,
    title: row.title as string,
    description: (row.description as string) || null,
    estimated_value: Number(row.estimated_value) || 0,
    procurement_method: row.procurement_method as ProcurementMethod,
    current_stage: row.current_stage as ProcurementStage,
    submitted_by: row.submitted_by as string,
    oversight_project_id: (row.oversight_project_id as string) || null,
    expected_delivery_date: (row.expected_delivery_date as string) || null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    agency_name: agencyName(row.agency as string),
    submitted_by_name: submitterName,
    days_at_current_stage: computeDaysAtStage(latestChangedAt, row.created_at as string),
  };
}

/**
 * Enrich an array of raw rows (with joined submitter + latest_history) into ProcurementPackage[].
 */
function enrichPackageRows(rows: Record<string, unknown>[]): ProcurementPackage[] {
  return rows.map((row) => {
    const historyArr = row.latest_history as { changed_at: string }[] | null;
    return enrichPackage(
      row,
      resolveJoinedName(row.submitter),
      historyArr?.[0]?.changed_at || null,
    );
  });
}

// ── Queries ───────────────────────────────────────────────────────────────

/**
 * Lightweight fetch: returns only id, agency, and current_stage.
 * Use for access-control checks instead of getPackageById() to avoid 4 unnecessary joins.
 */
export async function getPackageSummary(id: string): Promise<{ id: string; agency: string; current_stage: ProcurementStage } | null> {
  const { data, error } = await supabaseAdmin
    .from('procurement_packages')
    .select('id, agency, current_stage')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return { id: data.id as string, agency: data.agency as string, current_stage: data.current_stage as ProcurementStage };
}

/**
 * Shared fetch for package lists. Optional agency filter.
 */
async function fetchPackages(agency?: string): Promise<ProcurementPackage[]> {
  let query = supabaseAdmin
    .from('procurement_packages')
    .select(PACKAGE_SELECT)
    .order('created_at', { ascending: false });

  if (agency) query = query.ilike('agency', agency);

  const { data, error } = await query;
  if (error) throw error;

  return enrichPackageRows(sortRowHistory(data || []));
}

/**
 * Get all procurement packages for a specific agency.
 */
export function getPackagesByAgency(agency: string): Promise<ProcurementPackage[]> {
  return fetchPackages(agency);
}

/**
 * Get all procurement packages across all agencies.
 */
export function getAllPackages(): Promise<ProcurementPackage[]> {
  return fetchPackages();
}

/**
 * Get a single package by ID, with full nested stage_history, documents, and notes.
 */
export async function getPackageById(id: string): Promise<
  (ProcurementPackage & {
    stage_history: ProcurementStageHistory[];
    documents: ProcurementDocument[];
    notes: ProcurementNote[];
  }) | null
> {
  const [packageResult, historyResult, documentsResult, notesResult] = await Promise.all([
    supabaseAdmin
      .from('procurement_packages')
      .select(`${PACKAGE_COLUMNS}, submitter:users!procurement_packages_submitted_by_fkey(name)`)
      .eq('id', id)
      .single(),
    supabaseAdmin
      .from('procurement_stage_history')
      .select('id, package_id, from_stage, to_stage, changed_by, changed_at, notes, changer:users!procurement_stage_history_changed_by_fkey(name)')
      .eq('package_id', id)
      .order('changed_at', { ascending: false }),
    supabaseAdmin
      .from('procurement_documents')
      .select('id, package_id, file_name, file_path, file_type, uploaded_by, uploaded_at, uploader:users!procurement_documents_uploaded_by_fkey(name)')
      .eq('package_id', id)
      .order('uploaded_at', { ascending: false }),
    supabaseAdmin
      .from('procurement_notes')
      .select('id, package_id, content, created_by, created_at, author:users!procurement_notes_created_by_fkey(name)')
      .eq('package_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (packageResult.error || !packageResult.data) return null;

  const row = packageResult.data as Record<string, unknown>;
  const historyRows = historyResult.data || [];
  const latestChangedAt = historyRows[0]?.changed_at || null;

  const pkg = enrichPackage(row, resolveJoinedName(row.submitter), latestChangedAt);

  const stage_history: ProcurementStageHistory[] = (historyRows as Record<string, unknown>[]).map((h) => ({
    id: h.id as string,
    package_id: h.package_id as string,
    from_stage: (h.from_stage as ProcurementStage) || null,
    to_stage: h.to_stage as ProcurementStage,
    changed_by: h.changed_by as string,
    changed_at: h.changed_at as string,
    notes: (h.notes as string) || null,
    changed_by_name: resolveJoinedName(h.changer),
  }));

  const documents: ProcurementDocument[] = ((documentsResult.data || []) as Record<string, unknown>[]).map((d) => ({
    id: d.id as string,
    package_id: d.package_id as string,
    file_name: d.file_name as string,
    file_path: d.file_path as string,
    file_type: (d.file_type as string) || null,
    uploaded_by: d.uploaded_by as string,
    uploaded_at: d.uploaded_at as string,
    uploaded_by_name: resolveJoinedName(d.uploader),
  }));

  const notes: ProcurementNote[] = ((notesResult.data || []) as Record<string, unknown>[]).map((n) => ({
    id: n.id as string,
    package_id: n.package_id as string,
    content: n.content as string,
    created_by: n.created_by as string,
    created_at: n.created_at as string,
    created_by_name: resolveJoinedName(n.author),
  }));

  return { ...pkg, stage_history, documents, notes };
}

/**
 * Create a new procurement package. Also inserts the initial stage-history entry.
 */
export async function createPackage(input: {
  title: string;
  description?: string;
  estimated_value: number;
  procurement_method: ProcurementMethod;
  agency: string;
  submitted_by: string;
  oversight_project_id?: string;
  expected_delivery_date?: string;
  notes?: string;
}): Promise<ProcurementPackage> {
  const { data, error } = await supabaseAdmin
    .from('procurement_packages')
    .insert({
      title: input.title,
      description: input.description || null,
      estimated_value: input.estimated_value,
      procurement_method: input.procurement_method,
      agency: input.agency,
      submitted_by: input.submitted_by,
      oversight_project_id: input.oversight_project_id || null,
      expected_delivery_date: input.expected_delivery_date || null,
    })
    .select(`${PACKAGE_COLUMNS}, submitter:users!procurement_packages_submitted_by_fkey(name)`)
    .single();

  if (error) throw error;

  // Insert initial stage-history entry
  const { error: historyError } = await supabaseAdmin.from('procurement_stage_history').insert({
    package_id: data.id,
    from_stage: null,
    to_stage: 'pre_advertisement',
    changed_by: input.submitted_by,
    notes: null,
  });

  if (historyError) throw historyError;

  // Insert initial note if provided (non-blocking — package is already created)
  if (input.notes?.trim()) {
    const { error: noteError } = await supabaseAdmin.from('procurement_notes').insert({
      package_id: data.id,
      content: input.notes.trim(),
      created_by: input.submitted_by,
    });
    if (noteError) console.error('Failed to insert initial note for package', data.id, noteError);
  }

  const row = data as Record<string, unknown>;
  return enrichPackage(row, resolveJoinedName(row.submitter), new Date().toISOString());
}

/**
 * Advance (or change) a package's current stage.
 * Reads the current stage, updates the package, and logs the transition.
 */
export async function updatePackageStage(
  packageId: string,
  newStage: ProcurementStage,
  userId: string,
  notes?: string,
): Promise<ProcurementPackage> {
  // Read current stage
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('procurement_packages')
    .select('current_stage')
    .eq('id', packageId)
    .single();

  if (fetchError || !current) throw fetchError || new Error('Package not found');

  const fromStage = current.current_stage as ProcurementStage;

  // Update package + insert history in parallel
  const [updateResult] = await Promise.all([
    supabaseAdmin
      .from('procurement_packages')
      .update({ current_stage: newStage })
      .eq('id', packageId)
      .select(`${PACKAGE_COLUMNS}, submitter:users!procurement_packages_submitted_by_fkey(name)`)
      .single(),
    supabaseAdmin
      .from('procurement_stage_history')
      .insert({
        package_id: packageId,
        from_stage: fromStage,
        to_stage: newStage,
        changed_by: userId,
        notes: notes || null,
      }),
  ]);

  if (updateResult.error) throw updateResult.error;

  const row = updateResult.data as Record<string, unknown>;
  return enrichPackage(row, resolveJoinedName(row.submitter), new Date().toISOString());
}

/**
 * Add an immutable note to a procurement package.
 */
export async function addNote(
  packageId: string,
  content: string,
  userId: string,
): Promise<ProcurementNote> {
  const { data, error } = await supabaseAdmin
    .from('procurement_notes')
    .insert({
      package_id: packageId,
      content,
      created_by: userId,
    })
    .select('id, package_id, content, created_by, created_at, author:users!procurement_notes_created_by_fkey(name)')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    package_id: data.package_id,
    content: data.content,
    created_by: data.created_by,
    created_at: data.created_at,
    created_by_name: resolveJoinedName((data as Record<string, unknown>).author),
  };
}

/**
 * Record document metadata for a file uploaded to Supabase Storage.
 * The actual file upload happens in the API route — this just stores the DB record.
 */
export async function uploadDocument(input: {
  packageId: string;
  fileName: string;
  filePath: string;
  fileType: string | null;
  userId: string;
}): Promise<ProcurementDocument> {
  const { data, error } = await supabaseAdmin
    .from('procurement_documents')
    .insert({
      package_id: input.packageId,
      file_name: input.fileName,
      file_path: input.filePath,
      file_type: input.fileType,
      uploaded_by: input.userId,
    })
    .select('id, package_id, file_name, file_path, file_type, uploaded_by, uploaded_at, uploader:users!procurement_documents_uploaded_by_fkey(name)')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    package_id: data.package_id,
    file_name: data.file_name,
    file_path: data.file_path,
    file_type: data.file_type || null,
    uploaded_by: data.uploaded_by,
    uploaded_at: data.uploaded_at,
    uploaded_by_name: resolveJoinedName((data as Record<string, unknown>).uploader),
  };
}

/**
 * Delete a procurement package and all related records (cascaded via FK).
 * Storage files for documents are also removed.
 */
export async function deletePackage(packageId: string): Promise<void> {
  // Fetch document paths so we can clean up storage
  const { data: docs } = await supabaseAdmin
    .from('procurement_documents')
    .select('file_path')
    .eq('package_id', packageId);

  // Remove files from storage (best-effort)
  const paths = (docs || []).map((d) => d.file_path as string).filter(Boolean);
  if (paths.length > 0) {
    await supabaseAdmin.storage.from('procurement-documents').remove(paths);
  }

  // Delete the package — stage_history, documents, notes cascade via ON DELETE CASCADE
  const { error } = await supabaseAdmin
    .from('procurement_packages')
    .delete()
    .eq('id', packageId);

  if (error) throw error;
}

/**
 * Compute aggregate pipeline statistics across all packages.
 */
export async function getPipelineStats(agency?: string): Promise<PipelineStats> {
  let packagesQuery = supabaseAdmin
    .from('procurement_packages')
    .select('id, current_stage, estimated_value, created_at');

  if (agency) packagesQuery = packagesQuery.ilike('agency', agency);

  const [packagesResult, historyResult] = await Promise.all([
    packagesQuery,
    supabaseAdmin
      .from('procurement_stage_history')
      .select('package_id, to_stage, changed_at')
      .order('changed_at', { ascending: true }),
  ]);

  const packages = packagesResult.data || [];
  const allHistory = historyResult.data || [];

  // Group history by package_id
  const historyByPackage: Record<string, { to_stage: string; changed_at: string }[]> = {};
  for (const h of allHistory) {
    const pid = h.package_id as string;
    if (!historyByPackage[pid]) historyByPackage[pid] = [];
    historyByPackage[pid].push({ to_stage: h.to_stage as string, changed_at: h.changed_at as string });
  }

  // Initialize stats
  const by_stage = Object.fromEntries(
    PROCUREMENT_STAGES.map(s => [s, { count: 0, total_value: 0 }]),
  ) as PipelineStats['by_stage'];

  let totalActive = 0;
  let totalValue = 0;
  let stalledCount = 0;
  const awardedDurations: number[] = [];

  for (const pkg of packages) {
    const stage = pkg.current_stage as ProcurementStage;
    const value = Number(pkg.estimated_value) || 0;
    const history = historyByPackage[pkg.id as string] || [];

    by_stage[stage].count++;
    by_stage[stage].total_value += value;

    if (stage !== 'awarded') {
      totalActive++;
      totalValue += value;
    }

    // Compute days at current stage
    const latestEntry = history.length > 0 ? history[history.length - 1] : null;
    const daysAtStage = computeDaysAtStage(
      latestEntry?.changed_at || null,
      pkg.created_at as string,
    );

    if (stage !== 'awarded' && daysAtStage > STALLED_THRESHOLD_DAYS) {
      stalledCount++;
    }

    // Average days to award
    if (stage === 'awarded' && history.length >= 2) {
      const submittedAt = new Date(history[0].changed_at).getTime();
      const awardedEntry = history.find((h) => h.to_stage === 'awarded');
      if (awardedEntry) {
        const awardedAt = new Date(awardedEntry.changed_at).getTime();
        const days = Math.floor((awardedAt - submittedAt) / (1000 * 60 * 60 * 24));
        if (days >= 0) awardedDurations.push(days);
      }
    }
  }

  const avgDaysToAward = awardedDurations.length > 0
    ? Math.round(awardedDurations.reduce((a, b) => a + b, 0) / awardedDurations.length)
    : 0;

  return {
    total_active: totalActive,
    total_value: totalValue,
    avg_days_to_award: avgDaysToAward,
    stalled_count: stalledCount,
    by_stage,
  };
}

/**
 * Get packages that have been sitting at their current stage beyond a threshold.
 * Excludes awarded packages. Ordered by estimated_value DESC (highest-value stalled first).
 */
export async function getStalledPackages(thresholdDays: number = STALLED_THRESHOLD_DAYS): Promise<ProcurementPackage[]> {
  const { data, error } = await supabaseAdmin
    .from('procurement_packages')
    .select(PACKAGE_SELECT)
    .neq('current_stage', 'awarded')
    .order('estimated_value', { ascending: false });

  if (error) throw error;

  const allPackages = enrichPackageRows(sortRowHistory(data || []));
  return allPackages.filter((pkg) => pkg.days_at_current_stage > thresholdDays);
}
