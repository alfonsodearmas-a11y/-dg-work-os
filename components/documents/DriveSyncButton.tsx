'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CloudDownload, Loader2, CheckCircle, AlertTriangle, FolderOpen, Search, X, Unlink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SyncResult {
  newFiles: number;
  updatedFiles: number;
  skipped: number;
  errors: string[];
  folderFound: boolean;
}

interface DriveFolder {
  id: string;
  name: string;
}

interface DriveSyncButtonProps {
  onSyncComplete?: () => void;
  autoSync?: boolean;
}

export function DriveSyncButton({ onSyncComplete, autoSync = true }: DriveSyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [folderConnected, setFolderConnected] = useState<boolean | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const syncGuard = useRef(false);

  // Folder picker state
  const [showPicker, setShowPicker] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderSearch, setFolderSearch] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch sync status on mount
  useEffect(() => {
    fetchStatus();
  }, []);

  // Auto-sync on mount if folder already connected
  useEffect(() => {
    if (autoSync && folderConnected && !syncGuard.current) {
      syncGuard.current = true;
      handleSync();
    }
  }, [folderConnected, autoSync]);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/documents/sync/drive');
      if (res.ok) {
        const data = await res.json();
        setFolderConnected(data.folderConnected);
        setFolderName(data.folderName);
        setLastSyncedAt(data.lastSyncedAt);
      }
    } catch {
      // Non-critical
    }
  }

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setResult(null);
    setError(null);
    setAuthError(false);

    try {
      const res = await fetch('/api/documents/sync/drive', { method: 'POST' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try {
        data = await res.json();
      } catch {
        setError('Drive sync failed. Please try again.');
        return;
      }

      if (!res.ok) {
        if (data.authError) {
          setAuthError(true);
          setError('Google Drive access not authorized. Sign out and sign back in to grant Drive permissions.');
        } else {
          // Sanitize cryptic errors into user-friendly messages
          const raw = String(data.error || '');
          const isCryptic = raw.includes('pattern') || raw.includes('URL') || raw.length > 200;
          setError(isCryptic ? 'Drive sync encountered an error. Please try again.' : (raw || 'Sync failed'));
        }
        return;
      }

      setResult(data);
      if (data.folderFound) {
        setLastSyncedAt(new Date().toISOString());
        setFolderConnected(true);
      }

      if (data.newFiles > 0 || data.updatedFiles > 0) {
        onSyncComplete?.();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSyncing(false);
    }
  }, [syncing, onSyncComplete]);

  // Folder picker: search folders
  async function searchFolders(q: string) {
    setLoadingFolders(true);
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : '';
      const res = await fetch(`/api/documents/sync/drive/folders${params}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.authError) {
          setAuthError(true);
          setError('Google Drive access not authorized. Sign out and sign back in to grant Drive permissions.');
          setShowPicker(false);
        }
        return;
      }

      setFolders(data.folders || []);
    } catch {
      // fail silently
    } finally {
      setLoadingFolders(false);
    }
  }

  function openPicker() {
    setShowPicker(true);
    setFolderSearch('');
    searchFolders('');
  }

  function handleSearchChange(value: string) {
    setFolderSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchFolders(value), 300);
  }

  async function selectFolder(folder: DriveFolder) {
    setSavingFolder(true);
    try {
      const res = await fetch('/api/documents/sync/drive/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folder.id, folderName: folder.name }),
      });
      if (res.ok) {
        setFolderConnected(true);
        setFolderName(folder.name);
        setShowPicker(false);
        // Auto-trigger first sync
        syncGuard.current = false;
        setTimeout(() => handleSync(), 100);
      }
    } catch {
      // fail
    } finally {
      setSavingFolder(false);
    }
  }

  async function disconnectFolder() {
    try {
      await fetch('/api/documents/sync/drive/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      setFolderConnected(false);
      setFolderName(null);
      setLastSyncedAt(null);
      setResult(null);
      syncGuard.current = false;
    } catch {
      // fail
    }
  }

  // Not connected — show connect button
  if (!folderConnected && !syncing) {
    return (
      <>
        <button
          onClick={openPicker}
          className="btn-navy flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2"
        >
          <CloudDownload className="h-4 w-4" />
          <span className="hidden md:inline">Connect Drive</span>
        </button>

        {authError && error && (
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs max-w-sm">
            <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {showPicker && (
          <FolderPickerModal
            folders={folders}
            loading={loadingFolders}
            search={folderSearch}
            onSearchChange={handleSearchChange}
            onSelect={selectFolder}
            onClose={() => setShowPicker(false)}
            saving={savingFolder}
          />
        )}
      </>
    );
  }

  // Connected — show sync button
  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2 rounded-xl border transition-colors text-sm font-medium ${
            syncing
              ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
              : 'btn-navy'
          }`}
          title={folderName ? `Syncing: ${folderName}` : 'Sync from Drive'}
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CloudDownload className="h-4 w-4" />
          )}
          <span className="hidden md:inline">
            {syncing ? 'Syncing...' : 'Sync Drive'}
          </span>
        </button>

        {/* Change / disconnect folder */}
        <button
          onClick={openPicker}
          className="p-1.5 rounded-lg text-[#64748b] hover:text-[#d4af37] hover:bg-[#1a2744] transition-colors"
          title={folderName ? `Connected: ${folderName} — click to change` : 'Change folder'}
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>

        {lastSyncedAt && !syncing && (
          <span className="text-[10px] text-[#64748b] hidden lg:inline">
            {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Status toasts — positioned below the header row */}
      {(error || result) && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm space-y-2">
          {authError && error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs backdrop-blur-sm">
              <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          {error && !authError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs backdrop-blur-sm">
              <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          {result && result.folderFound && !error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs backdrop-blur-sm">
              <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              <span className="text-emerald-400">
                {result.newFiles > 0 || result.updatedFiles > 0
                  ? `Synced ${result.newFiles} new${result.updatedFiles > 0 ? `, ${result.updatedFiles} updated` : ''} from Drive`
                  : 'Everything up to date'}
              </span>
            </div>
          )}
        </div>
      )}

      {showPicker && (
        <FolderPickerModal
          folders={folders}
          loading={loadingFolders}
          search={folderSearch}
          onSearchChange={handleSearchChange}
          onSelect={selectFolder}
          onClose={() => setShowPicker(false)}
          saving={savingFolder}
          currentFolderName={folderName}
          onDisconnect={disconnectFolder}
        />
      )}
    </>
  );
}

// --- Folder Picker Modal ---

function FolderPickerModal({
  folders,
  loading,
  search,
  onSearchChange,
  onSelect,
  onClose,
  saving,
  currentFolderName,
  onDisconnect,
}: {
  folders: DriveFolder[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (f: DriveFolder) => void;
  onClose: () => void;
  saving: boolean;
  currentFolderName?: string | null;
  onDisconnect?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card-premium p-0 w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2d3a52]">
          <div className="flex items-center gap-2">
            <CloudDownload className="h-5 w-5 text-[#d4af37]" />
            <h3 className="text-white font-semibold">Choose Drive Folder</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current folder + disconnect */}
        {currentFolderName && onDisconnect && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#d4af37]/10 border-b border-[#2d3a52]">
            <span className="text-xs text-[#94a3b8]">
              Currently syncing: <strong className="text-white">{currentFolderName}</strong>
            </span>
            <button
              onClick={() => { onDisconnect(); onClose(); }}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Unlink className="h-3 w-3" />
              Disconnect
            </button>
          </div>
        )}

        {/* Search */}
        <div className="p-4 pb-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search your Drive folders..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 bg-[#1a2744] border border-[#2d3a52] rounded-xl text-white text-sm placeholder-[#64748b] focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-colors"
            />
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#64748b]" />
          </div>
        </div>

        {/* Folder list */}
        <div className="px-4 pb-4 max-h-72 overflow-y-auto space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 text-[#d4af37] animate-spin" />
            </div>
          ) : folders.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="h-8 w-8 text-[#64748b] mx-auto mb-2" />
              <p className="text-sm text-[#64748b]">
                {search ? 'No folders match your search' : 'No folders found in your Drive'}
              </p>
            </div>
          ) : (
            folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => onSelect(folder)}
                disabled={saving}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1a2744]/50 hover:bg-[#1a2744] border border-transparent hover:border-[#d4af37]/30 transition-all text-left disabled:opacity-50"
              >
                <FolderOpen className="h-5 w-5 text-[#d4af37] flex-shrink-0" />
                <span className="text-white text-sm font-medium truncate">{folder.name}</span>
                {saving && (
                  <Loader2 className="h-4 w-4 text-[#d4af37] animate-spin ml-auto flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
