'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2, CheckCircle, XCircle, FileSpreadsheet, AlertTriangle } from 'lucide-react';

interface DataQuality {
  total_projects: number;
  missing_completion_percent: number;
  missing_contractor: number;
  missing_region: number;
  missing_contract_value: number;
  missing_status: number;
  projects_without_completion: string[];
  projects_without_contractor: string[];
}

interface ProjectUploadProps {
  onUploadComplete?: () => void;
}

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB Vercel limit

export function ProjectUpload({ onUploadComplete }: ProjectUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [dataQuality, setDataQuality] = useState<DataQuality | null>(null);

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
    setDataQuality(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/projects/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setStatus('success');
      setMessage(`Successfully processed ${data.rowCount} projects`);
      setDataQuality(data.dataQuality);
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
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    },
    maxFiles: 1,
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
            <p className="text-white font-medium">Processing Excel file...</p>
            <p className="text-[#64748b] text-sm mt-1">Analyzing project data</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-[#d4af37]/20 flex items-center justify-center mb-4">
              {isDragActive ? (
                <FileSpreadsheet className="h-8 w-8 text-[#d4af37]" />
              ) : (
                <Upload className="h-8 w-8 text-[#d4af37]" />
              )}
            </div>
            <p className="text-white font-medium">
              {isDragActive ? 'Drop your Excel file here' : 'Drop Excel file or click to browse'}
            </p>
            <p className="text-[#64748b] text-sm mt-1">
              oversight.gov.gy export (.xlsx, .xls)
            </p>
          </div>
        )}
      </div>

      {status === 'success' && (
        <div className="space-y-4">
          <div className="flex items-center space-x-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-emerald-400 font-medium">{message}</p>
            </div>
          </div>

          {/* Data Quality Report */}
          {dataQuality && (
            <div className="p-4 rounded-xl bg-[#1a2744] border border-[#2d3a52]">
              <h3 className="text-white font-medium mb-3 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-2 text-[#d4af37]" />
                Data Quality Report
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-[#0a1628]">
                  <p className="text-[#64748b]">Total Projects</p>
                  <p className="text-white font-semibold text-lg">{dataQuality.total_projects}</p>
                </div>
                <div className={`p-3 rounded-lg ${dataQuality.missing_completion_percent > 0 ? 'bg-amber-500/10' : 'bg-[#0a1628]'}`}>
                  <p className="text-[#64748b]">Missing Completion %</p>
                  <p className={`font-semibold text-lg ${dataQuality.missing_completion_percent > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {dataQuality.missing_completion_percent}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${dataQuality.missing_contractor > 0 ? 'bg-amber-500/10' : 'bg-[#0a1628]'}`}>
                  <p className="text-[#64748b]">Missing Contractor</p>
                  <p className={`font-semibold text-lg ${dataQuality.missing_contractor > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {dataQuality.missing_contractor}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${dataQuality.missing_region > 0 ? 'bg-amber-500/10' : 'bg-[#0a1628]'}`}>
                  <p className="text-[#64748b]">Missing Region</p>
                  <p className={`font-semibold text-lg ${dataQuality.missing_region > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {dataQuality.missing_region}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${dataQuality.missing_contract_value > 0 ? 'bg-amber-500/10' : 'bg-[#0a1628]'}`}>
                  <p className="text-[#64748b]">Missing Value</p>
                  <p className={`font-semibold text-lg ${dataQuality.missing_contract_value > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {dataQuality.missing_contract_value}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${dataQuality.missing_status > 0 ? 'bg-amber-500/10' : 'bg-[#0a1628]'}`}>
                  <p className="text-[#64748b]">Missing Status</p>
                  <p className={`font-semibold text-lg ${dataQuality.missing_status > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {dataQuality.missing_status}
                  </p>
                </div>
              </div>

              {/* Show sample projects with missing data */}
              {dataQuality.projects_without_completion.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#2d3a52]">
                  <p className="text-[#64748b] text-sm mb-2">Projects without completion %:</p>
                  <div className="flex flex-wrap gap-2">
                    {dataQuality.projects_without_completion.map((ref) => (
                      <span key={ref} className="px-2 py-1 rounded text-xs font-mono bg-amber-500/10 text-amber-400">
                        {ref}
                      </span>
                    ))}
                    {dataQuality.missing_completion_percent > 10 && (
                      <span className="px-2 py-1 rounded text-xs text-[#64748b]">
                        +{dataQuality.missing_completion_percent - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
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
