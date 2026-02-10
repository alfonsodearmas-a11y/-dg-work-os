// Scriberr REST API client for audio transcription

const SCRIBERR_URL = process.env.SCRIBERR_URL || 'http://localhost:8080';
const SCRIBERR_API_KEY = process.env.SCRIBERR_API_KEY || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SCRIBERR_API_KEY) h['Authorization'] = `Bearer ${SCRIBERR_API_KEY}`;
  return h;
}

export interface ScriberrUploadResult {
  id: string;
}

export interface ScriberrStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface ScriberrTranscript {
  text: string;
  speakers?: { name: string; start: number; end: number; text: string }[];
}

export async function uploadAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<ScriberrUploadResult> {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  formData.append('webhook_url', `${APP_URL}/api/webhooks/scriberr`);

  const res = await fetch(`${SCRIBERR_URL}/api/transcribe`, {
    method: 'POST',
    headers: SCRIBERR_API_KEY ? { Authorization: `Bearer ${SCRIBERR_API_KEY}` } : undefined,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scriberr upload failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function getTranscriptionStatus(id: string): Promise<ScriberrStatus> {
  const res = await fetch(`${SCRIBERR_URL}/api/transcriptions/${id}`, {
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`Scriberr status check failed (${res.status})`);
  }

  return res.json();
}

export async function getTranscript(id: string): Promise<ScriberrTranscript> {
  const res = await fetch(`${SCRIBERR_URL}/api/transcriptions/${id}/transcript`, {
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`Scriberr transcript fetch failed (${res.status})`);
  }

  return res.json();
}
