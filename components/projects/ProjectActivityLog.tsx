'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Send, Loader2, AlertCircle } from 'lucide-react';

interface ProjectNote {
  id: string;
  project_id: string;
  user_id: string;
  note_text: string;
  note_type: 'general' | 'escalation' | 'status_update';
  created_at: string;
  user_name?: string;
  user_role?: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface ProjectActivityLogProps {
  projectId: string;
}

export function ProjectActivityLog({ projectId }: ProjectActivityLogProps) {
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/notes`)
      .then(r => r.json())
      .then(d => setNotes(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  async function addNote() {
    if (!newNote.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_text: newNote }),
      });
      const n = await res.json();
      if (n?.id) {
        setNotes(prev => [n, ...prev]);
        setNewNote('');
      }
    } catch {}
    setAdding(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-[#d4af37]" />
        <h4 className="text-white font-semibold text-sm">Activity Log</h4>
        <span className="text-[#64748b] text-xs">({notes.length})</span>
      </div>
      <div className="flex items-start gap-2 mb-4">
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          aria-label="Add a note"
          className="flex-1 bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none resize-none"
        />
        <button
          onClick={addNote}
          disabled={!newNote.trim() || adding}
          className="btn-gold p-2.5 rounded-lg disabled:opacity-40 shrink-0"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map(i => <div key={i} className="h-12 bg-[#2d3a52] rounded" />)}
        </div>
      ) : notes.length === 0 ? (
        <p className="text-[#64748b] text-sm">No notes yet.</p>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {notes.map(n => (
            <div
              key={n.id}
              className={`p-3 rounded-lg text-sm ${
                n.note_type === 'escalation'
                  ? 'bg-red-500/5 border border-red-500/20'
                  : 'bg-[#0a1628] border border-[#2d3a52]/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-xs">{n.user_name}</span>
                  <span className="text-[#4a5568] text-[10px]">{n.user_role}</span>
                  {n.note_type === 'escalation' && (
                    <span className="text-red-400 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10">
                      ESCALATION
                    </span>
                  )}
                </div>
                <span className="text-[#4a5568] text-[10px]">{timeAgo(n.created_at)}</span>
              </div>
              <p className="text-[#94a3b8] text-xs">{n.note_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
