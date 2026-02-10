'use client';

import Link from 'next/link';
import { useRecording } from './RecordingProvider';

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export function RecordingIndicator() {
  const { isRecording, isPaused, elapsedSeconds, recordedBlob } = useRecording();

  if (!isRecording && !recordedBlob) return null;

  return (
    <Link
      href="/meetings/record"
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 transition-colors"
    >
      <span className="relative flex h-2.5 w-2.5">
        {isRecording && !isPaused ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </>
        ) : (
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500/70" />
        )}
      </span>
      <span className="text-red-400 text-xs font-medium font-mono">
        {isRecording ? (
          <>
            {isPaused ? 'Paused' : 'REC'} {formatTime(elapsedSeconds)}
          </>
        ) : recordedBlob ? (
          'Unsaved Recording'
        ) : null}
      </span>
    </Link>
  );
}
