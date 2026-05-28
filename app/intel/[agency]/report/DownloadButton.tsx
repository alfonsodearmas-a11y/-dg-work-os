'use client';

export function DownloadButton({ agency }: { agency: string }) {
  return (
    <a
      href={`/api/intel/${agency}/report.pdf`}
      className="btn-gold inline-flex items-center gap-2"
      download
    >
      Download PDF
    </a>
  );
}
