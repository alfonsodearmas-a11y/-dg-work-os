'use client';

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  elapsedSeconds: number;
  recordedBlob: Blob | null;
  title: string;
  agency: string;
  attendees: string;
  meetingDate: string;
  notes: string;
  micPermission: 'prompt' | 'granted' | 'denied' | 'unknown';
}

interface RecordingContextValue extends RecordingState {
  setTitle: (v: string) => void;
  setAgency: (v: string) => void;
  setAttendees: (v: string) => void;
  setMeetingDate: (v: string) => void;
  setNotes: (v: string) => void;
  requestMicPermission: () => Promise<boolean>;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  discardRecording: () => void;
  uploadRecording: (opts?: { transcript?: string }) => Promise<{ id: string } | null>;
  uploading: boolean;
  uploadProgress: string | null;
  uploadError: string | null;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecording() {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error('useRecording must be used within RecordingProvider');
  return ctx;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function negotiateMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'audio/webm';
}

// ── Provider ───────────────────────────────────────────────────────────────

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    elapsedSeconds: 0,
    recordedBlob: null,
    title: '',
    agency: '',
    attendees: '',
    meetingDate: '',
    notes: '',
    micPermission: 'unknown',
  });

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');

  // Check mic permission on mount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' as PermissionName }).then(result => {
        setState(s => ({ ...s, micPermission: result.state as RecordingState['micPermission'] }));
        result.onchange = () => {
          setState(s => ({ ...s, micPermission: result.state as RecordingState['micPermission'] }));
        };
      }).catch(() => {
        // permissions API not supported for microphone on some browsers
      });
    }
  }, []);

  // beforeunload warning when blob exists
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (state.recordedBlob || state.isRecording) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.recordedBlob, state.isRecording]);

  // Timer effect
  useEffect(() => {
    if (state.isRecording && !state.isPaused) {
      timerRef.current = setInterval(() => {
        setState(s => ({ ...s, elapsedSeconds: s.elapsedSeconds + 1 }));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.isRecording, state.isPaused]);

  // Wake lock management
  const acquireWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Wake lock not supported or denied
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setState(s => ({ ...s, micPermission: 'granted' }));
      return true;
    } catch {
      setState(s => ({ ...s, micPermission: 'denied' }));
      return false;
    }
  }, []);

  const startRecording = useCallback(async () => {
    const mime = negotiateMimeType();
    mimeTypeRef.current = mime;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      setState(s => ({ ...s, isRecording: false, isPaused: false, recordedBlob: blob }));
      stream.getTracks().forEach(t => t.stop());
      releaseWakeLock();
    };

    mediaRecorderRef.current = recorder;
    recorder.start(1000); // collect chunks every second
    setState(s => ({ ...s, isRecording: true, isPaused: false, elapsedSeconds: 0, recordedBlob: null, micPermission: 'granted' }));
    setUploadError(null);
    await acquireWakeLock();
  }, [acquireWakeLock, releaseWakeLock]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setState(s => ({ ...s, isPaused: true }));
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setState(s => ({ ...s, isPaused: false }));
    }
  }, []);

  const discardRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    releaseWakeLock();
    setState(s => ({
      ...s,
      isRecording: false,
      isPaused: false,
      elapsedSeconds: 0,
      recordedBlob: null,
    }));
    setUploadError(null);
    setUploadProgress(null);
  }, [releaseWakeLock]);

  const uploadRecording = useCallback(async (opts?: { transcript?: string }): Promise<{ id: string } | null> => {
    setUploading(true);
    setUploadError(null);
    setUploadProgress('Preparing upload...');

    try {
      const formData = new FormData();
      formData.append('title', state.title.trim());
      if (state.meetingDate) formData.append('meeting_date', state.meetingDate);
      if (state.attendees.trim()) formData.append('attendees', state.attendees.trim());
      if (state.notes.trim()) formData.append('notes', state.notes.trim());
      if (state.agency) formData.append('agency', state.agency);
      if (state.elapsedSeconds > 0) formData.append('duration_seconds', String(state.elapsedSeconds));
      formData.append('recorded_at', new Date().toISOString());

      if (opts?.transcript) {
        formData.append('transcript', opts.transcript);
        setUploadProgress('Processing transcript...');
      } else if (state.recordedBlob) {
        const ext = mimeTypeRef.current.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([state.recordedBlob], `recording-${Date.now()}.${ext}`, { type: mimeTypeRef.current });
        formData.append('audio', file);
        setUploadProgress('Uploading audio...');
      } else {
        throw new Error('No audio or transcript to upload');
      }

      const res = await fetch('/api/meetings/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const result = await res.json();
      setUploadProgress('Done!');

      // Clear recording state
      setState(s => ({
        ...s,
        isRecording: false,
        isPaused: false,
        elapsedSeconds: 0,
        recordedBlob: null,
        title: '',
        agency: '',
        attendees: '',
        meetingDate: '',
        notes: '',
      }));

      return { id: result.id };
    } catch (err: any) {
      setUploadError(err.message);
      return null;
    } finally {
      setUploading(false);
    }
  }, [state.title, state.meetingDate, state.attendees, state.notes, state.agency, state.elapsedSeconds, state.recordedBlob]);

  const value: RecordingContextValue = {
    ...state,
    setTitle: (v) => setState(s => ({ ...s, title: v })),
    setAgency: (v) => setState(s => ({ ...s, agency: v })),
    setAttendees: (v) => setState(s => ({ ...s, attendees: v })),
    setMeetingDate: (v) => setState(s => ({ ...s, meetingDate: v })),
    setNotes: (v) => setState(s => ({ ...s, notes: v })),
    requestMicPermission,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    discardRecording,
    uploadRecording,
    uploading,
    uploadProgress,
    uploadError,
  };

  return (
    <RecordingContext.Provider value={value}>
      {children}
    </RecordingContext.Provider>
  );
}
