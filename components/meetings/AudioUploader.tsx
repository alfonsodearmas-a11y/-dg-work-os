'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mic,
  MicOff,
  Loader2,
  ClipboardPaste,
  X,
  Calendar,
  Users,
  FileText,
  Send,
  Pause,
  Play,
  Square,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  Building2,
  Upload,
} from 'lucide-react';
import { useRecording } from '@/components/recording/RecordingProvider';

// ── Agency options ─────────────────────────────────────────────────────────

const AGENCY_OPTIONS = [
  { value: '', label: 'Select agency...' },
  { value: 'GPL', label: 'GPL — Power' },
  { value: 'GWI', label: 'GWI — Water' },
  { value: 'CJIA', label: 'CJIA — Airport' },
  { value: 'GCAA', label: 'GCAA — Aviation' },
  { value: 'HECI', label: 'HECI — Energy' },
  { value: 'MARAD', label: 'MARAD — Maritime' },
  { value: 'HAS', label: 'HAS — Standards' },
  { value: 'Ministry', label: 'Ministry' },
  { value: 'Cross-Agency', label: 'Cross-Agency' },
];

// ── Waveform Visualizer ────────────────────────────────────────────────────

function WaveformVisualizer({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      if (!ctx || !analyserRef.current) return;
      animationRef.current = requestAnimationFrame(draw);

      analyserRef.current.getByteFrequencyData(dataArray);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barWidth = (w / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * h * 0.8;
        const intensity = dataArray[i] / 255;
        const r = Math.floor(212 + intensity * 43);
        const g = Math.floor(175 - intensity * 30);
        const b = Math.floor(55 - intensity * 20);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.6 + intensity * 0.4})`;

        const y = (h - barHeight) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(barWidth - 1, 1), barHeight, 2);
        ctx.fill();
        x += barWidth;
      }
    }

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
      source.disconnect();
      audioCtx.close();
    };
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={80}
      className="w-full h-20 rounded-lg"
    />
  );
}

// ── Format helpers ─────────────────────────────────────────────────────────

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return `${m}m ${sec}s`;
}

// ── Main Component ─────────────────────────────────────────────────────────

export function AudioUploader() {
  const router = useRouter();
  const rec = useRecording();

  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showMicPrompt, setShowMicPrompt] = useState(false);

  // Capture stream ref for waveform (from MediaRecorder)
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  // Capture the stream when recording starts
  const handleStartRecording = useCallback(async () => {
    if (!rec.title.trim()) {
      return; // title validation handled by disabled state
    }

    // Mic permission pre-prompt
    if (rec.micPermission !== 'granted') {
      setShowMicPrompt(true);
      return;
    }

    try {
      // Get a stream ref for the waveform before starting
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setActiveStream(stream);
      // The provider will get its own stream, so stop this one after a tick
      // Actually, let's use the RecordingProvider's approach
      stream.getTracks().forEach(t => t.stop());

      await rec.startRecording();
    } catch {
      // Error handled by provider
    }
  }, [rec]);

  const handleMicPermissionGrant = useCallback(async () => {
    setShowMicPrompt(false);
    const granted = await rec.requestMicPermission();
    if (granted) {
      try {
        await rec.startRecording();
      } catch {
        // Error handled by provider
      }
    }
  }, [rec]);

  // Update active stream when recording state changes
  useEffect(() => {
    // We need to access the stream from the provider's MediaRecorder
    // Since we can't easily get it, we'll create our own monitor stream
    if (rec.isRecording) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        setActiveStream(stream);
      }).catch(() => {});
    } else {
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
        setActiveStream(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.isRecording]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      activeStream?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProcessRecording = async () => {
    const result = await rec.uploadRecording();
    if (result) {
      router.push(`/meetings/recordings/${result.id}`);
    }
  };

  const handleProcessTranscript = async () => {
    if (!transcript.trim() || !rec.title.trim()) return;
    const result = await rec.uploadRecording({ transcript: transcript.trim() });
    if (result) {
      router.push(`/meetings/recordings/${result.id}`);
    }
  };

  const handleDiscard = () => {
    rec.discardRecording();
    setShowDiscardConfirm(false);
  };

  // ── Pre-Recording Screen ─────────────────────────────────────────────────

  if (!rec.isRecording && !rec.recordedBlob) {
    return (
      <div className="space-y-6">
        {/* Mic Permission Pre-Prompt Modal */}
        {showMicPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="card-premium p-6 max-w-sm w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#d4af37]/20 flex items-center justify-center">
                  <Mic className="h-6 w-6 text-[#d4af37]" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Microphone Access</h3>
                  <p className="text-[#64748b] text-sm">Required for recording</p>
                </div>
              </div>
              <p className="text-[#94a3b8] text-sm">
                DG Work OS needs microphone access to record meetings. Your browser will ask for permission next.
              </p>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setShowMicPrompt(false)} className="btn-navy px-4 py-2 text-sm">
                  Cancel
                </button>
                <button onClick={handleMicPermissionGrant} className="btn-gold px-4 py-2 text-sm">
                  Allow Microphone
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Metadata Form */}
        <div className="card-premium p-5 space-y-4">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#d4af37]" />
            Meeting Details
          </h3>

          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">Title *</label>
            <input
              type="text"
              value={rec.title}
              onChange={e => rec.setTitle(e.target.value)}
              placeholder="e.g. GPL Board Meeting"
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#4a5568] focus:border-[#d4af37] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5 flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Agency
              </label>
              <select
                value={rec.agency}
                onChange={e => rec.setAgency(e.target.value)}
                className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#d4af37] focus:outline-none"
              >
                {AGENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Date
              </label>
              <input
                type="datetime-local"
                value={rec.meetingDate}
                onChange={e => rec.setMeetingDate(e.target.value)}
                className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#d4af37] focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#64748b] mb-1.5 flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Attendees
            </label>
            <input
              type="text"
              value={rec.attendees}
              onChange={e => rec.setAttendees(e.target.value)}
              placeholder="Names, separated by commas"
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#4a5568] focus:border-[#d4af37] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">Notes / Context</label>
            <textarea
              value={rec.notes}
              onChange={e => rec.setNotes(e.target.value)}
              placeholder="Any context for the AI to consider during analysis..."
              rows={2}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#4a5568] focus:border-[#d4af37] focus:outline-none resize-y"
            />
          </div>
        </div>

        {/* Large Start Recording Button */}
        <div className="card-premium p-8 text-center">
          <button
            onClick={handleStartRecording}
            disabled={!rec.title.trim()}
            className="group relative inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 transition-all duration-300 shadow-lg shadow-red-500/20 hover:shadow-red-500/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-red-500/20"
          >
            <Mic className="h-12 w-12 text-white group-hover:scale-110 transition-transform" />
          </button>
          <p className="text-white font-semibold mt-4">Start Recording</p>
          <p className="text-[#64748b] text-sm mt-1">Tap to begin capturing audio</p>
          {!rec.title.trim() && (
            <p className="text-[#d4af37] text-xs mt-2">Enter a title above to start</p>
          )}
        </div>

        {/* Paste Transcript (collapsible) */}
        <div className="card-premium overflow-hidden">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#1a2744]/30 transition-colors"
          >
            <span className="text-[#64748b] text-sm flex items-center gap-2">
              <ClipboardPaste className="h-4 w-4" />
              Or paste a transcript instead
            </span>
            {showTranscript ? <ChevronUp className="h-4 w-4 text-[#64748b]" /> : <ChevronDown className="h-4 w-4 text-[#64748b]" />}
          </button>
          {showTranscript && (
            <div className="px-5 pb-5 space-y-3">
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Paste meeting transcript here..."
                className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg p-4 text-sm text-[#c8d1df] font-mono leading-relaxed focus:border-[#d4af37] focus:outline-none min-h-[200px] resize-y"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748b]">
                  {transcript.trim() ? `${transcript.trim().split(/\s+/).length} words` : 'No text yet'}
                </span>
                <div className="flex items-center gap-2">
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
                          if (!rec.title) rec.setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
                        }
                      }}
                    />
                    Upload .txt / .srt file
                  </label>
                  <button
                    onClick={handleProcessTranscript}
                    disabled={rec.uploading || !transcript.trim() || !rec.title.trim()}
                    className="btn-gold text-sm px-4 py-1.5 inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {rec.uploading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                      <><Send className="h-4 w-4" /> Process Transcript</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Link to import page */}
        <div className="text-center">
          <button
            onClick={() => router.push('/meetings/import')}
            className="text-[#64748b] text-sm hover:text-[#d4af37] transition-colors inline-flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Import a recording file instead
          </button>
        </div>
      </div>
    );
  }

  // ── Active Recording Screen ──────────────────────────────────────────────

  if (rec.isRecording) {
    return (
      <div className="space-y-6">
        <div className="card-premium p-6 md:p-8 text-center space-y-6">
          {/* Title */}
          <div>
            <p className="text-[#64748b] text-xs uppercase tracking-wider mb-1">Recording</p>
            <h2 className="text-white font-semibold text-lg">{rec.title}</h2>
            {rec.agency && (
              <span className="inline-block mt-1 text-xs bg-[#d4af37]/20 text-[#d4af37] px-2 py-0.5 rounded">{rec.agency}</span>
            )}
          </div>

          {/* Waveform */}
          <div className="bg-[#0a1628] rounded-xl p-3 border border-[#2d3a52]">
            <WaveformVisualizer stream={activeStream} />
          </div>

          {/* Timer */}
          <p className="text-white font-mono text-4xl tracking-wider">
            {formatTime(rec.elapsedSeconds)}
          </p>

          {/* Status */}
          <div className="flex items-center justify-center gap-2">
            <span className="relative flex h-3 w-3">
              {!rec.isPaused ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500" />
              )}
            </span>
            <span className={`text-sm font-medium ${rec.isPaused ? 'text-yellow-400' : 'text-red-400'}`}>
              {rec.isPaused ? 'Paused' : 'Recording...'}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {rec.isPaused ? (
              <button
                onClick={rec.resumeRecording}
                className="w-14 h-14 rounded-full bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37]/50 transition-colors flex items-center justify-center"
                title="Resume"
              >
                <Play className="h-6 w-6 text-[#d4af37]" />
              </button>
            ) : (
              <button
                onClick={rec.pauseRecording}
                className="w-14 h-14 rounded-full bg-[#1a2744] border border-[#2d3a52] hover:border-yellow-500/50 transition-colors flex items-center justify-center"
                title="Pause"
              >
                <Pause className="h-6 w-6 text-yellow-400" />
              </button>
            )}
            <button
              onClick={rec.stopRecording}
              className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 hover:bg-red-500/30 transition-colors flex items-center justify-center"
              title="Stop"
            >
              <Square className="h-7 w-7 text-red-400 fill-red-400" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Post-Recording Screen ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Discard Confirmation */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card-premium p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <h3 className="text-white font-semibold">Discard Recording?</h3>
            </div>
            <p className="text-[#94a3b8] text-sm">
              This recording will be permanently deleted. This action cannot be undone.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setShowDiscardConfirm(false)} className="btn-navy px-4 py-2 text-sm">
                Keep
              </button>
              <button
                onClick={handleDiscard}
                className="px-4 py-2 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card-premium p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
          <CheckCircle className="h-8 w-8 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-white font-semibold text-lg">Meeting Recorded</h2>
          <p className="text-[#64748b] text-sm mt-1">
            {formatDuration(rec.elapsedSeconds)} &middot; {rec.title}
          </p>
          {rec.agency && (
            <span className="inline-block mt-1 text-xs bg-[#d4af37]/20 text-[#d4af37] px-2 py-0.5 rounded">{rec.agency}</span>
          )}
        </div>
      </div>

      {/* Metadata Review */}
      <div className="card-premium p-5 space-y-3">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#d4af37]" />
          Review Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {rec.meetingDate && (
            <div className="flex items-center gap-2 text-[#94a3b8]">
              <Calendar className="h-4 w-4 text-[#64748b]" />
              {new Date(rec.meetingDate).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
          {rec.attendees && (
            <div className="flex items-center gap-2 text-[#94a3b8]">
              <Users className="h-4 w-4 text-[#64748b]" />
              {rec.attendees}
            </div>
          )}
        </div>
        {rec.notes && (
          <p className="text-[#64748b] text-sm italic">{rec.notes}</p>
        )}
      </div>

      {/* Upload progress / error */}
      {rec.uploadProgress && (
        <div className="card-premium p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-[#d4af37] animate-spin shrink-0" />
            <div className="flex-1">
              <p className="text-white text-sm font-medium">{rec.uploadProgress}</p>
              <div className="mt-2 h-1.5 bg-[#2d3a52] rounded-full overflow-hidden">
                <div className="h-full bg-[#d4af37] rounded-full animate-pulse w-2/3" />
              </div>
            </div>
          </div>
        </div>
      )}

      {rec.uploadError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span className="text-red-400 text-sm">{rec.uploadError}</span>
          <button onClick={() => {}} className="ml-auto text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setShowDiscardConfirm(true)}
          disabled={rec.uploading}
          className="btn-navy px-5 py-2.5 text-sm inline-flex items-center gap-2 text-red-400 hover:text-red-300"
        >
          <Trash2 className="h-4 w-4" /> Discard
        </button>
        <button
          onClick={handleProcessRecording}
          disabled={rec.uploading}
          className="btn-gold px-6 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-50"
        >
          {rec.uploading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
          ) : (
            <><Send className="h-4 w-4" /> Process Recording</>
          )}
        </button>
      </div>

      {/* Paste Transcript (collapsible) */}
      <div className="card-premium overflow-hidden">
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#1a2744]/30 transition-colors"
        >
          <span className="text-[#64748b] text-sm flex items-center gap-2">
            <ClipboardPaste className="h-4 w-4" />
            Or paste a transcript instead
          </span>
          {showTranscript ? <ChevronUp className="h-4 w-4 text-[#64748b]" /> : <ChevronDown className="h-4 w-4 text-[#64748b]" />}
        </button>
        {showTranscript && (
          <div className="px-5 pb-5 space-y-3">
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Paste meeting transcript here..."
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg p-4 text-sm text-[#c8d1df] font-mono leading-relaxed focus:border-[#d4af37] focus:outline-none min-h-[200px] resize-y"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b]">
                {transcript.trim() ? `${transcript.trim().split(/\s+/).length} words` : 'No text yet'}
              </span>
              <button
                onClick={handleProcessTranscript}
                disabled={rec.uploading || !transcript.trim()}
                className="btn-gold text-sm px-4 py-1.5 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {rec.uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                  <><Send className="h-4 w-4" /> Process Transcript</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
