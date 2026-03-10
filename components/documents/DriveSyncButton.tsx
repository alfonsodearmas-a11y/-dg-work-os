'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CloudDownload, Loader2, CheckCircle, AlertTriangle, FolderOpen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SyncResult {
  newFiles: number;
  updatedFiles: number;
  skipped: number;
  errors: string[];
  folderFound: boolean;
  folderId?: string;
}

interface DriveSyncButtonProps {
  onSyncComplete?: () => void;
  autoSync?: boolean;
}

export function DriveSyncButton({ onSyncComplete, autoSync = true }: DriveSyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [folderConnected, setFolderConnected] = useState<boolean | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const syncGuard = useRef(false);

  // Fetch sync status on mount
  useEffect(() => {
    fetchStatus();
  }, []);

  // Auto-sync on mount (debounced via guard)
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
        setLastSyncedAt(data.lastSyncedAt);
      }
    } catch {
      // Non-critical — status just won't show
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
      const data = await res.json();

      if (!res.ok) {
        if (data.authError) {
          setAuthError(true);
          setError('Google Drive access not authorized. Please sign out and sign back in to grant Drive permissions.');
        } else {
          setError(data.error || 'Sync failed');
        }
        return;
      }

      setResult(data);
      setFolderConnected(data.folderFound);
      if (data.folderFound) {
        setLastSyncedAt(new Date().toISOString());
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

  // No folder found state
  if (folderConnected === false && !syncing && !result) {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-xl bg-[#1a2744]/50 border border-[#2d3a52]">
        <div className="flex items-center gap-2 text-sm text-[#94a3b8]">
          <FolderOpen className="h-4 w-4 text-[#d4af37]" />
          <span>
            Create a folder called <strong className="text-white">&ldquo;MPUA Doc Vault&rdquo;</strong> in your Google Drive to enable auto-sync.
          </span>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn-navy flex items-center gap-2 px-3 py-1.5 text-xs shrink-0"
        >
          <CloudDownload className="h-3.5 w-3.5" />
          Check Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2 rounded-xl border transition-colors text-sm font-medium ${
            syncing
              ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
              : 'btn-navy'
          }`}
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

        {lastSyncedAt && !syncing && (
          <span className="text-[10px] text-[#64748b] hidden sm:inline">
            Last synced {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Auth error */}
      {authError && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {/* General error */}
      {error && !authError && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {/* Success result */}
      {result && result.folderFound && !error && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
          <span className="text-emerald-400">
            {result.newFiles > 0 || result.updatedFiles > 0
              ? `Synced ${result.newFiles} new${result.updatedFiles > 0 ? `, ${result.updatedFiles} updated` : ''} document${result.newFiles + result.updatedFiles !== 1 ? 's' : ''} from Google Drive`
              : 'Everything up to date'}
          </span>
        </div>
      )}

      {/* Folder not found after sync */}
      {result && !result.folderFound && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/20 text-xs">
          <FolderOpen className="h-3.5 w-3.5 text-[#d4af37] flex-shrink-0" />
          <span className="text-[#94a3b8]">
            Folder <strong className="text-white">&ldquo;MPUA Doc Vault&rdquo;</strong> not found in your Drive. Create it to enable sync.
          </span>
        </div>
      )}
    </div>
  );
}
