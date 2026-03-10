import { google, drive_v3 } from 'googleapis';
import { supabaseAdmin } from './db';
import { extractText } from './document-parser';
import { analyzeDocument } from './document-analyzer';
import { logger } from './logger';

// Supported MIME types and their export formats for Google Workspace files
const GOOGLE_EXPORT_MAP: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: 'pdf' },
};

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  ...Object.keys(GOOGLE_EXPORT_MAP),
]);

export interface SyncProgress {
  total: number;
  processed: number;
  newFiles: number;
  updatedFiles: number;
  skipped: number;
  errors: string[];
  currentFile?: string;
}

export interface SyncResult {
  newFiles: number;
  updatedFiles: number;
  skipped: number;
  errors: string[];
  folderFound: boolean;
  folderId?: string;
}

// --- Drive API Client ---

async function getDriveClient(userId: string): Promise<drive_v3.Drive> {
  const { getGoogleCalendarToken } = await import('./integration-tokens');
  const token = await getGoogleCalendarToken(userId);

  if (!token) {
    throw new Error('No Google OAuth token found. Please reconnect your Google account.');
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: token.refresh_token });

  return google.drive({ version: 'v3', auth: client });
}

// --- Folder Management ---

export interface DriveFolder {
  id: string;
  name: string;
}

/** List folders in the user's Drive (for the picker UI) */
export async function listDriveFolders(userId: string, query?: string): Promise<DriveFolder[]> {
  const drive = await getDriveClient(userId);

  let q = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  if (query) {
    const sanitized = query.replace(/'/g, "\\'");
    q += ` and name contains '${sanitized}'`;
  }

  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
    orderBy: 'name',
    pageSize: 50,
  });

  return (res.data.files || []).map(f => ({ id: f.id!, name: f.name! }));
}

/** Save the user's chosen folder ID */
export async function setFolderId(userId: string, folderId: string, folderName: string): Promise<void> {
  await supabaseAdmin.from('user_settings').upsert(
    { user_id: userId, key: 'google_drive_folder_id', value: folderId },
    { onConflict: 'user_id,key' }
  );
  await supabaseAdmin.from('user_settings').upsert(
    { user_id: userId, key: 'google_drive_folder_name', value: folderName },
    { onConflict: 'user_id,key' }
  );
}

/** Clear the stored folder (disconnect) */
export async function clearFolderId(userId: string): Promise<void> {
  await supabaseAdmin.from('user_settings').delete().eq('user_id', userId).eq('key', 'google_drive_folder_id');
  await supabaseAdmin.from('user_settings').delete().eq('user_id', userId).eq('key', 'google_drive_folder_name');
  await supabaseAdmin.from('user_settings').delete().eq('user_id', userId).eq('key', 'drive_last_synced_at');
}

/** Get the stored folder ID (returns null if user hasn't picked one) */
export async function getStoredFolderId(userId: string): Promise<string | null> {
  const { data: setting } = await supabaseAdmin
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'google_drive_folder_id')
    .single();

  return setting?.value || null;
}

// --- File Operations ---

function sanitizeFileName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const base = name.replace(/\.[^/.]+$/, '');
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${sanitized}-${Date.now()}.${ext}`;
}

function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = '';
  for (const para of paragraphs) {
    if ((current + para).length > chunkSize && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += '\n\n' + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function downloadDriveFile(
  drive: drive_v3.Drive,
  file: drive_v3.Schema$File
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const fileId = file.id!;
  const fileMime = file.mimeType || '';
  const fileName = file.name || 'untitled';

  // Google Workspace files need export
  const exportInfo = GOOGLE_EXPORT_MAP[fileMime];
  if (exportInfo) {
    const res = await drive.files.export(
      { fileId, mimeType: exportInfo.mime },
      { responseType: 'arraybuffer' }
    );
    const buffer = Buffer.from(res.data as ArrayBuffer);
    const exportName = fileName.replace(/\.[^/.]+$/, '') + '.' + exportInfo.ext;
    return { buffer, mimeType: exportInfo.mime, fileName: exportName };
  }

  // Regular files: direct download
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return { buffer: Buffer.from(res.data as ArrayBuffer), mimeType: fileMime, fileName };
}

async function processAndStoreFile(
  buffer: Buffer,
  mimeType: string,
  originalFileName: string,
  driveFileId: string,
  driveModifiedTime: string
): Promise<void> {
  const storageFilename = sanitizeFileName(originalFileName);

  // Upload to Supabase Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(storageFilename, buffer, { contentType: mimeType });

  if (uploadError) throw uploadError;

  // Create document record
  const { data: doc, error: dbError } = await supabaseAdmin
    .from('documents')
    .insert({
      filename: storageFilename,
      original_filename: originalFileName,
      file_path: storageFilename,
      file_size: buffer.length,
      mime_type: mimeType,
      processing_status: 'processing',
      google_drive_file_id: driveFileId,
      sync_source: 'google_drive',
      synced_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (dbError) throw dbError;

  // Process in background (extract text + AI analysis)
  processDocument(doc.id, buffer, mimeType, originalFileName).catch((err) =>
    logger.error({ err, documentId: doc.id }, 'Drive sync: background processing failed')
  );
}

async function updateExistingFile(
  docId: string,
  buffer: Buffer,
  mimeType: string,
  originalFileName: string,
  filePath: string,
): Promise<void> {
  // Replace file in storage
  await supabaseAdmin.storage.from('documents').remove([filePath]);
  const newFilename = sanitizeFileName(originalFileName);
  const { error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(newFilename, buffer, { contentType: mimeType });

  if (uploadError) throw uploadError;

  // Delete old chunks
  await supabaseAdmin.from('document_chunks').delete().eq('document_id', docId);

  // Update record
  await supabaseAdmin
    .from('documents')
    .update({
      filename: newFilename,
      file_path: newFilename,
      file_size: buffer.length,
      mime_type: mimeType,
      processing_status: 'processing',
      synced_at: new Date().toISOString(),
    })
    .eq('id', docId);

  // Re-process
  processDocument(docId, buffer, mimeType, originalFileName).catch((err) =>
    logger.error({ err, documentId: docId }, 'Drive sync: re-processing failed')
  );
}

async function processDocument(
  docId: string,
  buffer: Buffer,
  mimeType: string,
  originalFilename: string
): Promise<void> {
  try {
    const text = await extractText(buffer, mimeType);
    const analysis = await analyzeDocument(text, originalFilename);

    const chunks = chunkText(text, 1000);
    if (chunks.length > 0) {
      await supabaseAdmin.from('document_chunks').insert(
        chunks.map((content, index) => ({
          document_id: docId,
          chunk_index: index,
          content,
        }))
      );
    }

    await supabaseAdmin
      .from('documents')
      .update({
        title: analysis.title,
        summary: analysis.summary,
        document_type: analysis.document_type,
        document_date: analysis.document_date,
        agency: analysis.agency,
        tags: analysis.tags,
        project_reference: analysis.project_reference,
        extracted_data: {
          figures: analysis.key_figures,
          dates: analysis.key_dates,
          people: analysis.key_people,
          commitments: analysis.commitments,
        },
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', docId);
  } catch (error) {
    logger.error({ err: error, documentId: docId }, 'Drive sync: document processing failed');
    await supabaseAdmin
      .from('documents')
      .update({ processing_status: 'failed' })
      .eq('id', docId);
  }
}

// --- Main Sync Function ---

export async function syncDriveFolder(userId: string): Promise<SyncResult> {
  const result: SyncResult = {
    newFiles: 0,
    updatedFiles: 0,
    skipped: 0,
    errors: [],
    folderFound: false,
  };

  // Get the user's chosen folder
  const folderId = await getStoredFolderId(userId);
  if (!folderId) {
    result.folderFound = false;
    return result;
  }

  result.folderFound = true;
  result.folderId = folderId;

  const drive = await getDriveClient(userId);

  // List all files in the folder
  let allFiles: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
      pageSize: 100,
      pageToken,
    });
    allFiles = allFiles.concat(res.data.files || []);
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  // Get existing Drive-synced documents
  const driveFileIds = allFiles.map(f => f.id!).filter(Boolean);
  const { data: existingDocs } = await supabaseAdmin
    .from('documents')
    .select('id, google_drive_file_id, synced_at, file_path')
    .in('google_drive_file_id', driveFileIds.length > 0 ? driveFileIds : ['__none__']);

  const existingMap = new Map(
    (existingDocs || []).map(d => [d.google_drive_file_id, d])
  );

  for (const file of allFiles) {
    const fileId = file.id!;
    const fileMime = file.mimeType || '';
    const fileName = file.name || 'untitled';

    // Check supported type
    if (!SUPPORTED_MIME_TYPES.has(fileMime)) {
      logger.info({ fileName, mimeType: fileMime }, 'Drive sync: skipping unsupported file type');
      result.skipped++;
      continue;
    }

    try {
      const existing = existingMap.get(fileId);

      if (existing) {
        // Check if file was modified since last sync
        const driveModified = new Date(file.modifiedTime || 0).getTime();
        const lastSynced = new Date(existing.synced_at || 0).getTime();

        if (driveModified > lastSynced) {
          // File was updated — re-download and re-analyze
          const downloaded = await downloadDriveFile(drive, file);
          if (downloaded) {
            await updateExistingFile(
              existing.id,
              downloaded.buffer,
              downloaded.mimeType,
              downloaded.fileName,
              existing.file_path,
            );
            result.updatedFiles++;
          }
        } else {
          result.skipped++;
        }
      } else {
        // New file — download and import
        const downloaded = await downloadDriveFile(drive, file);
        if (downloaded) {
          await processAndStoreFile(
            downloaded.buffer,
            downloaded.mimeType,
            downloaded.fileName,
            fileId,
            file.modifiedTime || new Date().toISOString()
          );
          result.newFiles++;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: error, fileName, fileId }, 'Drive sync: file processing error');
      result.errors.push(`${fileName}: ${msg}`);
    }
  }

  // Update last sync time
  await supabaseAdmin.from('user_settings').upsert(
    {
      user_id: userId,
      key: 'drive_last_synced_at',
      value: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' }
  );

  return result;
}

// --- Status Check ---

export async function getDriveSyncStatus(userId: string): Promise<{
  folderConnected: boolean;
  folderId: string | null;
  folderName: string | null;
  lastSyncedAt: string | null;
}> {
  const { data: folderSetting } = await supabaseAdmin
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'google_drive_folder_id')
    .single();

  const { data: nameSetting } = await supabaseAdmin
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'google_drive_folder_name')
    .single();

  const { data: lastSyncSetting } = await supabaseAdmin
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'drive_last_synced_at')
    .single();

  return {
    folderConnected: !!folderSetting?.value,
    folderId: folderSetting?.value || null,
    folderName: nameSetting?.value || null,
    lastSyncedAt: lastSyncSetting?.value || null,
  };
}
