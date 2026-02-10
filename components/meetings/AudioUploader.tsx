'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Mic,
  MicOff,
  Loader2,
  FileAudio,
  ClipboardPaste,
  X,
  Calendar,
  Users,
  FileText,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

type Tab = 'upload' | 'record' | 'transcript';

export function AudioUploader() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Metadata
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [attendees, setAttendees] = useState('');
  const [notes, setNotes] = useState('');

  // Audio upload
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Browser recording
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Manual transcript
  const [transcript, setTranscript] = useState('');

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
  }, [title]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      setError('Microphone access denied. Please allow microphone access and try again.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      if (meetingDate) formData.append('meeting_date', meetingDate);
      if (attendees.trim()) formData.append('attendees', attendees.trim());
      if (notes.trim()) formData.append('notes', notes.trim());

      if (activeTab === 'transcript') {
        if (!transcript.trim()) { setError('Transcript is required'); setUploading(false); return; }
        formData.append('transcript', transcript.trim());
      } else if (activeTab === 'record' && recordedBlob) {
        const file = new File([recordedBlob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
        formData.append('audio', file);
      } else if (activeTab === 'upload' && audioFile) {
        formData.append('audio', audioFile);
      } else {
        setError('No audio or transcript provided');
        setUploading(false);
        return;
      }

      const res = await fetch('/api/meetings/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const { id } = await res.json();
      router.push(`/meetings/recordings/${id}`);
    } catch (err: any) {
      setError(err.message);
      setUploading(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'upload', label: 'Upload Audio', icon: Upload },
    { id: 'record', label: 'Record', icon: Mic },
    { id: 'transcript', label: 'Paste Transcript', icon: ClipboardPaste },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/30'
                  : 'bg-[#1a2744] text-[#64748b] border border-[#2d3a52] hover:text-white hover:border-[#64748b]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Upload Zone */}
      {activeTab === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`card-premium p-8 text-center cursor-pointer transition-all duration-200 ${
            dragOver ? 'border-[#d4af37] bg-[#d4af37]/5' : 'hover:border-[#d4af37]/30'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          {audioFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileAudio className="h-8 w-8 text-[#d4af37]" />
              <div className="text-left">
                <p className="text-white font-medium text-sm">{audioFile.name}</p>
                <p className="text-[#64748b] text-xs">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setAudioFile(null); }}
                className="p-1.5 rounded-lg hover:bg-[#2d3a52] text-[#64748b] hover:text-red-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-[#64748b] mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Drop audio file here or click to browse</p>
              <p className="text-[#64748b] text-sm">MP3, WAV, M4A, WebM, OGG — up to 500MB</p>
            </>
          )}
        </div>
      )}

      {/* Browser Recording */}
      {activeTab === 'record' && (
        <div className="card-premium p-8 text-center">
          {recording ? (
            <>
              <div className="relative inline-flex items-center justify-center mb-4">
                <div className="absolute w-20 h-20 rounded-full bg-red-500/20 animate-pulse" />
                <MicOff className="h-10 w-10 text-red-400 relative z-10 cursor-pointer" onClick={stopRecording} />
              </div>
              <p className="text-white font-mono text-2xl mb-2">{formatTime(recordingTime)}</p>
              <p className="text-red-400 text-sm mb-4">Recording in progress...</p>
              <button onClick={stopRecording} className="btn-navy px-6 py-2.5 inline-flex items-center gap-2">
                <MicOff className="h-4 w-4" /> Stop Recording
              </button>
            </>
          ) : recordedBlob ? (
            <>
              <FileAudio className="h-10 w-10 text-[#d4af37] mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Recording ready — {formatTime(recordingTime)}</p>
              <p className="text-[#64748b] text-sm mb-4">{(recordedBlob.size / 1024 / 1024).toFixed(1)} MB</p>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => { setRecordedBlob(null); setRecordingTime(0); }} className="btn-navy px-4 py-2 text-sm">
                  Discard
                </button>
                <button onClick={startRecording} className="btn-navy px-4 py-2 text-sm inline-flex items-center gap-2">
                  <Mic className="h-4 w-4" /> Re-record
                </button>
              </div>
            </>
          ) : (
            <>
              <Mic className="h-10 w-10 text-[#64748b] mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Record from your microphone</p>
              <p className="text-[#64748b] text-sm mb-4">Click to start recording. Audio will be captured as WebM.</p>
              <button onClick={startRecording} className="btn-gold px-6 py-2.5 inline-flex items-center gap-2">
                <Mic className="h-4 w-4" /> Start Recording
              </button>
            </>
          )}
        </div>
      )}

      {/* Transcript Paste */}
      {activeTab === 'transcript' && (
        <div className="card-premium p-5">
          <p className="text-[#94a3b8] text-sm mb-3">
            Paste or type the meeting transcript below. You can also upload a .txt or .srt file.
          </p>
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Paste meeting transcript here..."
            className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg p-4 text-sm text-[#c8d1df] font-mono leading-relaxed focus:border-[#d4af37] focus:outline-none min-h-[250px] resize-y"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-[#64748b]">
              {transcript.trim() ? `${transcript.trim().split(/\s+/).length} words` : 'No text yet'}
            </span>
            <label className="text-xs text-[#d4af37] cursor-pointer hover:text-[#e5c04b] transition-colors">
              <input
                type="file"
                accept=".txt,.srt"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const text = await file.text();
                    setTranscript(text);
                    if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
                  }
                }}
              />
              Upload .txt / .srt file
            </label>
          </div>
        </div>
      )}

      {/* Metadata Fields */}
      <div className="card-premium p-5 space-y-4">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#d4af37]" />
          Meeting Details
        </h3>

        <div>
          <label className="block text-xs text-[#64748b] mb-1.5">Title *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. GPL Board Meeting"
            className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#4a5568] focus:border-[#d4af37] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5 flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Date
            </label>
            <input
              type="datetime-local"
              value={meetingDate}
              onChange={e => setMeetingDate(e.target.value)}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#d4af37] focus:outline-none [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5 flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Attendees
            </label>
            <input
              type="text"
              value={attendees}
              onChange={e => setAttendees(e.target.value)}
              placeholder="Names, separated by commas"
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#4a5568] focus:border-[#d4af37] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[#64748b] mb-1.5">Notes / Context</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any context for the AI to consider during analysis..."
            rows={2}
            className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#4a5568] focus:border-[#d4af37] focus:outline-none resize-y"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
          <span className="text-red-400 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => router.push('/meetings/recordings')}
          className="btn-navy px-5 py-2.5 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={uploading || !title.trim()}
          className="btn-gold px-6 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-50"
        >
          {uploading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
          ) : (
            <><Send className="h-4 w-4" /> {activeTab === 'transcript' ? 'Process Transcript' : 'Upload & Transcribe'}</>
          )}
        </button>
      </div>
    </div>
  );
}
