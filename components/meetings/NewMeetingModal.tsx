'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  XCircle,
  ArrowLeft,
  Mic,
} from 'lucide-react';
import { MeetingRecorder } from './MeetingRecorder';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NewMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (meetingId: string) => void;
}

type PipelineStep = 'create' | 'upload' | 'transcribe' | 'analyze';
type StepState = 'pending' | 'active' | 'done' | 'error';

const PIPELINE_STEPS: { key: PipelineStep; label: string }[] = [
  { key: 'create', label: 'Create Meeting' },
  { key: 'upload', label: 'Upload Audio' },
  { key: 'transcribe', label: 'Transcribe with Whisper' },
  { key: 'analyze', label: 'Analyze with GPT-4o' },
];

const INITIAL_STEP_STATES: Record<PipelineStep, StepState> = {
  create: 'pending',
  upload: 'pending',
  transcribe: 'pending',
  analyze: 'pending',
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;

type InputMode = 'record' | 'upload';

// ── Component ─────────────────────────────────────────────────────────────────

export function NewMeetingModal({ isOpen, onClose, onComplete }: NewMeetingModalProps) {
  // Step navigation
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: form
  const [title, setTitle] = useState('');
  const [attendeesStr, setAttendeesStr] = useState('');

  // Input mode toggle
  const [inputMode, setInputMode] = useState<InputMode>('record');

  // Step 2 (upload mode): file + pipeline
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [stepStates, setStepStates] = useState(INITIAL_STEP_STATES);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // Dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDropAccepted: (files) => setAudioFile(files[0]),
    accept: { 'audio/*': [], 'video/*': [] },
    maxSize: MAX_FILE_SIZE,
    multiple: false,
    disabled: pipelineRunning,
  });

  // Reset everything on close
  const handleClose = useCallback(() => {
    if (pipelineRunning) return;
    setStep(1);
    setTitle('');
    setAttendeesStr('');
    setInputMode('record');
    setAudioFile(null);
    setStepStates(INITIAL_STEP_STATES);
    setPipelineRunning(false);
    setPipelineError(null);
    onClose();
  }, [pipelineRunning, onClose]);

  // ── Pipeline (upload mode) ──────────────────────────────────────────────

  function updateStep(key: PipelineStep, state: StepState) {
    setStepStates((prev) => ({ ...prev, [key]: state }));
  }

  async function runPipeline() {
    setPipelineRunning(true);
    setPipelineError(null);
    setStepStates(INITIAL_STEP_STATES);

    const attendees = attendeesStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      // 1. Create meeting
      updateStep('create', 'active');
      const createRes = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, attendees }),
      });
      if (!createRes.ok) throw new Error('Failed to create meeting');
      const { meeting } = await createRes.json();
      const meetingId: string = meeting.id;
      updateStep('create', 'done');

      // 2. Upload audio
      updateStep('upload', 'active');
      const form = new FormData();
      form.append('audio', audioFile!);
      const uploadRes = await fetch(`/api/meetings/${meetingId}/upload`, {
        method: 'POST',
        body: form,
      });
      if (!uploadRes.ok) throw new Error('Failed to upload audio');
      updateStep('upload', 'done');

      // 3. Transcribe
      updateStep('transcribe', 'active');
      const transcribeRes = await fetch(`/api/meetings/${meetingId}/transcribe`, {
        method: 'POST',
      });
      if (!transcribeRes.ok) throw new Error('Transcription failed');
      updateStep('transcribe', 'done');

      // 4. Analyze
      updateStep('analyze', 'active');
      const analyzeRes = await fetch(`/api/meetings/${meetingId}/analyze`, {
        method: 'POST',
      });
      if (!analyzeRes.ok) throw new Error('Analysis failed');
      updateStep('analyze', 'done');

      onComplete(meetingId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pipeline failed';
      setPipelineError(msg);
      setStepStates((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated) as PipelineStep[]) {
          if (updated[key] === 'active') updated[key] = 'error';
        }
        return updated;
      });
    } finally {
      setPipelineRunning(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const meetingModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pipelineRunning) handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pipelineRunning, handleClose]);

  useEffect(() => {
    if (!isOpen || !meetingModalRef.current) return;
    const focusable = meetingModalRef.current.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const attendees = attendeesStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={meetingModalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-meeting-modal-title"
        className="relative w-full max-w-lg rounded-t-2xl md:rounded-2xl bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border border-[#2d3a52] shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-up md:animate-fade-in"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2d3a52]">
          <div className="flex items-center gap-2">
            {step === 2 && !pipelineRunning && (
              <button
                onClick={() => setStep(1)}
                className="p-1.5 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 id="new-meeting-modal-title" className="text-lg font-semibold text-white">
              {step === 1 ? 'New Meeting' : inputMode === 'record' ? 'Record & Process' : 'Upload & Process'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={pipelineRunning}
            aria-label="Close"
            className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 space-y-4">
          {/* ── Step 1: Details ──────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div>
                <label htmlFor="new-meeting-title" className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  id="new-meeting-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. GPL Board Review"
                  className="input-premium w-full"
                  autoFocus
                  aria-required="true"
                />
              </div>
              <div>
                <label htmlFor="new-meeting-attendees" className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                  Attendees <span className="text-[#64748b]">(optional, comma-separated)</span>
                </label>
                <input
                  id="new-meeting-attendees"
                  type="text"
                  value={attendeesStr}
                  onChange={(e) => setAttendeesStr(e.target.value)}
                  placeholder="e.g. John Smith, Jane Doe"
                  className="input-premium w-full"
                />
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-lg border border-[#2d3a52] overflow-hidden">
                <button
                  onClick={() => setInputMode('record')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    inputMode === 'record'
                      ? 'bg-[#d4af37]/10 text-[#d4af37] border-b-2 border-[#d4af37]'
                      : 'text-[#64748b] hover:text-white'
                  }`}
                >
                  <Mic className="h-4 w-4" />
                  Record
                </button>
                <button
                  onClick={() => setInputMode('upload')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    inputMode === 'upload'
                      ? 'bg-[#d4af37]/10 text-[#d4af37] border-b-2 border-[#d4af37]'
                      : 'text-[#64748b] hover:text-white'
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </button>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!title.trim()}
                className="btn-gold w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </>
          )}

          {/* ── Step 2: Record or Upload + Pipeline ─────────────────── */}
          {step === 2 && (
            <>
              {/* ── RECORD MODE ──────────────────────────────────────── */}
              {inputMode === 'record' && (
                <MeetingRecorder
                  title={title}
                  attendees={attendees}
                  onComplete={onComplete}
                />
              )}

              {/* ── UPLOAD MODE ──────────────────────────────────────── */}
              {inputMode === 'upload' && (
                <>
                  {/* Drop zone — hide once pipeline starts */}
                  {!pipelineRunning && !pipelineError && stepStates.create === 'pending' && (
                    <>
                      <div
                        {...getRootProps()}
                        className={`upload-zone p-6 text-center cursor-pointer ${
                          isDragActive ? 'drag-over' : ''
                        }`}
                      >
                        <input {...getInputProps()} aria-label="Select audio or video file to upload" />
                        {audioFile ? (
                          <div>
                            <FileText className="h-8 w-8 text-[#d4af37] mx-auto mb-2" />
                            <p className="text-white font-medium truncate">{audioFile.name}</p>
                            <p className="text-[#64748b] text-sm mt-1">
                              {(audioFile.size / 1024 / 1024).toFixed(1)} MB — click or drop to replace
                            </p>
                          </div>
                        ) : (
                          <div>
                            <Upload
                              className={`h-8 w-8 mx-auto mb-2 ${
                                isDragActive ? 'text-[#d4af37]' : 'text-[#64748b]'
                              }`}
                            />
                            <p className="text-white font-medium">
                              {isDragActive ? 'Drop file here...' : 'Drop audio or video file'}
                            </p>
                            <p className="text-[#64748b] text-sm mt-1">Max 25 MB</p>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={runPipeline}
                        disabled={!audioFile}
                        className="btn-gold w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Start Transcription
                      </button>
                    </>
                  )}

                  {/* Pipeline progress */}
                  {(pipelineRunning || pipelineError || stepStates.create !== 'pending') && (
                    <div className="space-y-0">
                      {PIPELINE_STEPS.map((s, i) => {
                        const state = stepStates[s.key];
                        return (
                          <div key={s.key}>
                            <div className="flex items-center gap-3 py-2">
                              {state === 'done' && (
                                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                              )}
                              {state === 'active' && (
                                <Loader2 className="h-5 w-5 text-[#d4af37] animate-spin shrink-0" />
                              )}
                              {state === 'pending' && (
                                <div className="w-5 h-5 rounded-full border-2 border-[#2d3a52] shrink-0" />
                              )}
                              {state === 'error' && (
                                <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                              )}
                              <span
                                className={`text-sm font-medium ${
                                  state === 'done'
                                    ? 'text-emerald-400'
                                    : state === 'active'
                                      ? 'text-[#d4af37]'
                                      : state === 'error'
                                        ? 'text-red-400'
                                        : 'text-[#64748b]'
                                }`}
                              >
                                {s.label}
                              </span>
                            </div>
                            {i < PIPELINE_STEPS.length - 1 && (
                              <div
                                className={`ml-[9px] h-4 w-px ${
                                  state === 'done' ? 'bg-emerald-400/30' : 'bg-[#2d3a52]'
                                }`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Error */}
                  {pipelineError && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3">
                      <p className="text-red-400 text-sm">{pipelineError}</p>
                      <button
                        onClick={runPipeline}
                        className="btn-navy text-xs mt-2 px-3 py-1.5"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
