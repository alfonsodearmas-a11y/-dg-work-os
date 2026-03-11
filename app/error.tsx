'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error('[DG-WorkOS] Global error:', error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1b2e]">
      <div className="text-center max-w-md mx-auto p-8">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center bg-[rgba(201,168,76,0.1)] border-2 border-[rgba(201,168,76,0.3)]">
          <svg className="w-8 h-8 text-[#c9a84c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Something went wrong</h1>
        <p className="text-sm text-navy-600 mb-6">An unexpected error occurred. Please try again.</p>
        <button
          onClick={reset}
          className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors bg-[#c9a84c] text-[#0d1b2e] hover:bg-[#b8973f]"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
