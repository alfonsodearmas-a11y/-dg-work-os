'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Square,
  CheckCircle2,
  Loader2,
  XCircle,
  RotateCcw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MeetingRecorderProps {
  title: string;
  attendees?: string[];
  onComplete: (meetingId: string) => void;
}

type RecorderState =
  | 'idle'
  | 'recording'
  | 'stopped'
  | 'uploading'
  | 'transcribing'
  | 'analyzing'
  | 'done'
  | 'error';

type PipelineStep = 'upload' | 'transcribe' | 'analyze';
type StepState = 'pending' | 'active' | 'done' | 'error';

const PIPELINE_STEPS: { key: PipelineStep; label: string; activeLabel: string }[] = [
  { key: 'upload', label: 'Upload Audio', activeLabel: 'Uploading audio...' },
  { key: 'transcribe', label: 'Transcribe with Whisper', activeLabel: 'Transcribing with Whisper...' },
  { key: 'analyze', label: 'Analyze with GPT-4o', activeLabel: 'Analyzing with GPT-4o...' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pickMimeType(): string {
  if (typeof MediaRecorder !== 'undefined') {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  }
  return 'audio/webm';
}

// ── Visualizer ────────────────────────────────────────────────────────────────

function AudioVisualizer({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barCount = 12;

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      analyser!.getByteFrequencyData(dataArray);

      ctx!.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / barCount) * 0.6;
      const gap = (canvas.width / barCount) * 0.4;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        // Average a range of bins for each bar
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += dataArray[i * step + j];
        }
        const avg = sum / step;
        const barHeight = Math.max(4, (avg / 255) * canvas.height * 0.9);
        const x = i * (barWidth + gap) + gap / 2;
        const y = (canvas.height - barHeight) / 2;

        ctx!.fillStyle = '#d4af37';
        ctx!.beginPath();
        ctx!.roundRect(x, y, barWidth, barHeight, 2);
        ctx!.fill();
      }
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={48}
      className="w-[200px] h-[48px]"
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MeetingRecorder({ title, attendees = [], onComplete }: MeetingRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepStates, setStepStates] = useState<Record<PipelineStep, StepState>>({
    upload: 'pending',
    transcribe: 'pending',
    analyze: 'pending',
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [audioUrl]);

  // ── Recording Controls ──────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Web Audio analyser for visualizer
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      setAnalyserNode(analyser);

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState('stopped');

        // Stop tracks
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setAnalyserNode(null);
      };

      recorder.start(250); // collect chunks every 250ms
      setState('recording');
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const discard = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsed(0);
    setState('idle');
  }, [audioUrl]);

  // ── Pipeline ────────────────────────────────────────────────────────────

  function updateStep(key: PipelineStep, s: StepState) {
    setStepStates(prev => ({ ...prev, [key]: s }));
  }

  async function runPipeline() {
    if (!audioBlob) return;

    setError(null);
    setStepStates({ upload: 'pending', transcribe: 'pending', analyze: 'pending' });

    try {
      // 1. Create meeting
      const createRes = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, attendees }),
      });
      if (!createRes.ok) throw new Error('Failed to create meeting');
      const { meeting } = await createRes.json();
      const meetingId: string = meeting.id;

      // 2. Upload
      setState('uploading');
      updateStep('upload', 'active');
      const file = new File([audioBlob], 'recording.webm', { type: audioBlob.type });
      const form = new FormData();
      form.append('audio', file);
      const uploadRes = await fetch(`/api/meetings/${meetingId}/upload`, {
        method: 'POST',
        body: form,
      });
      if (!uploadRes.ok) throw new Error('Failed to upload audio');
      updateStep('upload', 'done');

      // 3. Transcribe
      setState('transcribing');
      updateStep('transcribe', 'active');
      const transcribeRes = await fetch(`/api/meetings/${meetingId}/transcribe`, {
        method: 'POST',
      });
      if (!transcribeRes.ok) throw new Error('Transcription failed');
      updateStep('transcribe', 'done');

      // 4. Analyze
      setState('analyzing');
      updateStep('analyze', 'active');
      const analyzeRes = await fetch(`/api/meetings/${meetingId}/analyze`, {
        method: 'POST',
      });
      if (!analyzeRes.ok) throw new Error('Analysis failed');
      updateStep('analyze', 'done');

      setState('done');
      onComplete(meetingId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pipeline failed';
      setError(msg);
      setState('error');
      setStepStates(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated) as PipelineStep[]) {
          if (updated[key] === 'active') updated[key] = 'error';
        }
        return updated;
      });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  // IDLE
  if (state === 'idle') {
    return (
      <div className="flex flex-col items-center py-6">
        <button
          onClick={startRecording}
          className="w-20 h-20 rounded-full bg-[#d4af37]/20 border-2 border-[#d4af37] flex items-center justify-center hover:bg-[#d4af37]/30 transition-colors group"
        >
          <Mic className="h-8 w-8 text-[#d4af37] group-hover:scale-110 transition-transform" />
        </button>
        <p className="text-[#94a3b8] text-sm font-medium mt-4">Start Recording</p>
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 mt-4 w-full">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // RECORDING
  if (state === 'recording') {
    return (
      <div className="flex flex-col items-center py-6">
        {/* Timer + pulse */}
        <div className="flex items-center gap-3 mb-5">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white font-mono text-2xl font-bold tracking-wider">
            {formatElapsed(elapsed)}
          </span>
        </div>

        {/* Visualizer */}
        <div className="mb-6">
          <AudioVisualizer analyser={analyserNode} />
        </div>

        {/* Stop button */}
        <button
          onClick={stopRecording}
          className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center hover:bg-red-500/30 transition-colors group"
        >
          <Square className="h-6 w-6 text-red-400 group-hover:scale-110 transition-transform" />
        </button>
        <p className="text-[#64748b] text-xs mt-3">Tap to stop</p>
      </div>
    );
  }

  // STOPPED — review
  if (state === 'stopped' && audioUrl) {
    return (
      <div className="space-y-4 py-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={audioUrl} className="w-full" />

        <div className="flex gap-3">
          <button
            onClick={runPipeline}
            className="btn-gold flex-1 flex items-center justify-center gap-2 text-sm"
          >
            <CheckCircle2 className="h-4 w-4" />
            Use this recording
          </button>
          <button
            onClick={discard}
            className="btn-navy flex items-center justify-center gap-2 text-sm px-4"
          >
            <RotateCcw className="h-4 w-4" />
            Discard
          </button>
        </div>
      </div>
    );
  }

  // UPLOADING / TRANSCRIBING / ANALYZING / DONE / ERROR — pipeline view
  const isPipelineState = ['uploading', 'transcribing', 'analyzing', 'done', 'error'].includes(state);
  if (isPipelineState) {
    return (
      <div className="py-2 space-y-4">
        {/* Step indicator */}
        <div className="space-y-0">
          {PIPELINE_STEPS.map((s, i) => {
            const stepState = stepStates[s.key];
            return (
              <div key={s.key}>
                <div className="flex items-center gap-3 py-2">
                  {stepState === 'done' && (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  )}
                  {stepState === 'active' && (
                    <Loader2 className="h-5 w-5 text-[#d4af37] animate-spin shrink-0" />
                  )}
                  {stepState === 'pending' && (
                    <div className="w-5 h-5 rounded-full border-2 border-[#2d3a52] shrink-0" />
                  )}
                  {stepState === 'error' && (
                    <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      stepState === 'done'
                        ? 'text-emerald-400'
                        : stepState === 'active'
                          ? 'text-[#d4af37]'
                          : stepState === 'error'
                            ? 'text-red-400'
                            : 'text-[#64748b]'
                    }`}
                  >
                    {stepState === 'active' ? s.activeLabel : s.label}
                  </span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div
                    className={`ml-[9px] h-4 w-px ${
                      stepState === 'done' ? 'bg-emerald-400/30' : 'bg-[#2d3a52]'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Done */}
        {state === 'done' && (
          <div className="flex items-center gap-2 pt-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-medium">Analysis complete</span>
          </div>
        )}

        {/* Error */}
        {state === 'error' && error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={runPipeline}
              className="btn-navy text-xs mt-2 px-3 py-1.5"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
