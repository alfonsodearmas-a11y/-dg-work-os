'use client';

import { useState, useCallback } from 'react';
import { FileSpreadsheet, AlertCircle, X } from 'lucide-react';
import { UploadStep } from './gpl/UploadStep';
import { PreviewStep } from './gpl/PreviewStep';
import { SubmissionStep } from './gpl/SubmissionStep';

const API_BASE = '/api';

interface GPLExcelUploadProps {
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}

export function GPLExcelUpload({ onSuccess, onCancel }: GPLExcelUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // After successful upload, store the saved data
  const [savedData, setSavedData] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setPreview(null);
    setSavedData(null);
    setAiAnalysis(null);
  }, []);

  const parseFile = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/gpl/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || `Upload failed (${response.status})`);
        return;
      }

      const result = await response.json();

      if (!result.success) {
        const errMsg = typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to parse file';
        setError(errMsg);
        return;
      }

      setPreview(result.preview);
    } catch (err: any) {
      setError('Failed to upload file: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const submitData = async () => {
    if (!preview) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/gpl/upload/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadData: preview,
          reportDate: preview.reportDate,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        const errMsg = typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to submit data';
        setError(errMsg);
        return;
      }

      // Save the result, clear preview so the success view renders
      setSavedData(result);
      setPreview(null);

      // Fetch the latest data to display
      await fetchLatestData();

      // Start polling for AI analysis
      if (result.uploadId) {
        pollForAnalysis(result.uploadId);
      }
    } catch (err: any) {
      setError('Failed to submit: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fetchLatestData = async () => {
    try {
      const response = await fetch(`${API_BASE}/gpl/latest`);
      const result = await response.json();
      if (result.success && result.data) {
        setSavedData((prev: any) => ({ ...prev, latestData: result.data }));
      }
    } catch (err) {
      console.error('Failed to fetch latest data:', err);
    }
  };

  const pollForAnalysis = async (uploadId: string) => {
    setLoadingAnalysis(true);

    // Poll every 2 seconds for up to 60 seconds
    const maxAttempts = 30;
    let attempts = 0;

    const checkAnalysis = async (): Promise<boolean> => {
      try {
        const response = await fetch(`${API_BASE}/gpl/analysis/${uploadId}`);
        const result = await response.json();

        if (result.success && result.data) {
          const { status, analysis } = result.data;
          if (status === 'completed' && analysis?.executiveBriefing) {
            setAiAnalysis(analysis);
            setLoadingAnalysis(false);
            return true;
          } else if (status === 'failed') {
            setAiAnalysis({ error: analysis?.error || 'Analysis failed' });
            setLoadingAnalysis(false);
            return true;
          }
        }
      } catch (err) {
        console.error('Error checking analysis:', err);
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkAnalysis, 2000);
      } else {
        setLoadingAnalysis(false);
      }
      return false;
    };

    // Start checking after a short delay
    setTimeout(checkAnalysis, 1000);
  };

  const retryAnalysis = async () => {
    if (!savedData?.uploadId) return;

    setLoadingAnalysis(true);
    setAiAnalysis(null);

    try {
      await fetch(`${API_BASE}/gpl/analysis/${savedData.uploadId}`, {
        method: 'POST'
      });

      pollForAnalysis(savedData.uploadId);
    } catch (err: any) {
      setError('Failed to retry analysis: ' + err.message);
      setLoadingAnalysis(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setSavedData(null);
    setAiAnalysis(null);
  };

  const uploadAnother = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    // Keep savedData visible but allow new upload
  };

  // Results view (post-submission)
  if (savedData && !preview) {
    return (
      <div className="bg-navy-900 rounded-xl p-6 border border-navy-800">
        <SubmissionStep
          savedData={savedData}
          aiAnalysis={aiAnalysis}
          loadingAnalysis={loadingAnalysis}
          onUploadAnother={uploadAnother}
          onRetryAnalysis={retryAnalysis}
        />
      </div>
    );
  }

  return (
    <div className="bg-navy-900 rounded-xl p-6 border border-navy-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[22px] font-semibold text-white flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-amber-400" />
          Upload GPL DBIS Excel
        </h3>
        {onCancel && (
          <button onClick={onCancel} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{typeof error === 'string' ? error : JSON.stringify(error)}</span>
        </div>
      )}

      {!preview ? (
        <UploadStep
          file={file}
          loading={loading}
          onFileSelect={handleFileSelect}
          onError={setError}
          onParse={parseFile}
        />
      ) : (
        <PreviewStep
          preview={preview}
          submitting={submitting}
          onSubmit={submitData}
          onCancel={reset}
        />
      )}
    </div>
  );
}
