'use client';

import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useDropZone } from '@/hooks/useDropZone';

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB Vercel limit

interface UploadStepProps {
  file: File | null;
  loading: boolean;
  onFileSelect: (file: File) => void;
  onError: (error: string) => void;
  onParse: () => void;
}

export function UploadStep({ file, loading, onFileSelect, onError, onParse }: UploadStepProps) {
  const handleFileDrop = (files: File[]) => {
    const droppedFile = files[0];
    if (!droppedFile) return;

    if (!droppedFile.name.match(/\.xlsx$/i)) {
      onError('Please upload an Excel file (.xlsx)');
      return;
    }
    if (droppedFile.size > MAX_FILE_SIZE) {
      onError('File too large. Maximum 4.5MB.');
      return;
    }
    onFileSelect(droppedFile);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE) {
        onError('File too large. Maximum 4.5MB.');
        return;
      }
      onFileSelect(selectedFile);
    }
  };

  const { isDragging, dropZoneProps } = useDropZone({
    onFileDrop: handleFileDrop,
    accept: ['.xlsx'],
  });

  return (
    <>
      {/* Drop Zone */}
      <div
        {...dropZoneProps}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          isDragging
            ? 'border-amber-400 bg-amber-400/10'
            : 'border-navy-800 hover:border-navy-700'
        }`}
      >
        <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-amber-400' : 'text-navy-600'}`} />
        <p className="text-white mb-2">
          {file ? file.name : 'Drag and drop your DBIS Excel file here'}
        </p>
        <p className="text-navy-600 text-sm mb-4">or</p>
        <label className="inline-block px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg cursor-pointer transition-colors">
          Browse Files
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileInput}
            aria-label="Select DBIS Excel file"
            className="hidden"
          />
        </label>
        {file && (
          <p className="mt-4 text-sm text-slate-400">
            Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </div>

      {/* Parse Button */}
      {file && (
        <button
          onClick={onParse}
          disabled={loading}
          className="mt-4 w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-navy-700 text-black font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Parsing...
            </>
          ) : (
            <>
              <FileSpreadsheet className="w-5 h-5" />
              Parse Excel File
            </>
          )}
        </button>
      )}
    </>
  );
}
