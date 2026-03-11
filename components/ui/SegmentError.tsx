'use client';

interface SegmentErrorProps {
  message: string;
  error: Error & { digest?: string };
  reset: () => void;
}

export function SegmentError({ message, error, reset }: SegmentErrorProps) {
  console.error(`[DG-WorkOS] ${message}:`, error);

  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center bg-[rgba(201,168,76,0.1)] border border-[rgba(201,168,76,0.3)]">
          <svg className="w-6 h-6 text-[#c9a84c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white mb-1">{message}</h2>
        <p className="text-sm text-navy-600 mb-5">Something went wrong. Please try again.</p>
        <button
          onClick={reset}
          className="px-5 py-2 rounded-lg text-sm font-medium transition-colors bg-[#c9a84c] text-[#0d1b2e] hover:bg-[#b8973f]"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
