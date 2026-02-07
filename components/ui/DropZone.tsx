'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB Vercel limit

interface DropZoneProps {
  onDrop: (files: File[]) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  className?: string;
  label?: string;
}

export function DropZone({
  onDrop,
  accept,
  maxSize = MAX_FILE_SIZE,
  className = '',
  label = 'Drop files here or click to upload'
}: DropZoneProps) {
  const onDropAccepted = useCallback((acceptedFiles: File[]) => {
    onDrop(acceptedFiles);
  }, [onDrop]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDropAccepted,
    accept,
    maxSize,
    multiple: false
  });

  return (
    <div
      {...getRootProps()}
      className={`upload-zone p-8 text-center cursor-pointer transition-colors
        ${isDragActive ? 'drag-over' : ''}
        ${className}`}
    >
      <input {...getInputProps()} />
      <div className="w-16 h-16 rounded-2xl bg-[#d4af37]/20 flex items-center justify-center mx-auto mb-4">
        <Upload className={`h-8 w-8 ${isDragActive ? 'text-[#d4af37]' : 'text-[#64748b]'}`} />
      </div>
      <p className="text-white font-medium">
        {isDragActive ? 'Drop the file here...' : label}
      </p>
      <p className="text-[#64748b] text-sm mt-2">
        Max file size: {Math.round(maxSize / 1024 / 1024)}MB
      </p>
    </div>
  );
}
