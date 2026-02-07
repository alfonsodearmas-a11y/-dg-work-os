'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2, CheckCircle, XCircle, FileText } from 'lucide-react';

interface UploadZoneProps {
  onUploadComplete?: () => void;
}

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB Vercel limit

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setStatus('error');
      setMessage('File too large. Maximum 4.5MB.');
      return;
    }

    setUploading(true);
    setStatus('idle');
    setMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Upload failed');
      }

      setStatus('success');
      setMessage(`${file.name} uploaded successfully. AI analysis in progress...`);
      onUploadComplete?.();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    disabled: uploading
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`upload-zone p-8 text-center cursor-pointer ${
          isDragActive ? 'drag-over' : ''
        } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div className="flex flex-col items-center">
            <Loader2 className="h-12 w-12 text-[#d4af37] animate-spin mb-4" />
            <p className="text-white font-medium">Uploading and analyzing...</p>
            <p className="text-[#64748b] text-sm mt-1">Claude is processing your document</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-[#d4af37]/20 flex items-center justify-center mb-4">
              {isDragActive ? (
                <FileText className="h-8 w-8 text-[#d4af37]" />
              ) : (
                <Upload className="h-8 w-8 text-[#d4af37]" />
              )}
            </div>
            <p className="text-white font-medium">
              {isDragActive ? 'Drop your document here' : 'Drop document or click to browse'}
            </p>
            <p className="text-[#64748b] text-sm mt-1">
              PDF, Word, Excel, or Text files (max 4.5MB)
            </p>
          </div>
        )}
      </div>

      {status === 'success' && (
        <div className="flex items-center space-x-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-emerald-400 font-medium">{message}</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center space-x-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-400 font-medium">{message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
