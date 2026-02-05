'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { DocumentViewer } from '@/components/documents/DocumentViewer';

export default function DocumentPage() {
  const router = useRouter();
  const params = useParams();
  const [document, setDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchDocument(params.id as string);
    }
  }, [params.id]);

  async function fetchDocument(id: string) {
    try {
      const res = await fetch(`/api/documents/${id}`);
      if (!res.ok) throw new Error('Document not found');
      const data = await res.json();
      setDocument(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24">
        <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <p className="text-red-400 font-medium mb-4">{error}</p>
        <Link href="/documents" className="text-[#d4af37] hover:underline">
          Back to Documents
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/documents"
        className="inline-flex items-center p-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors text-[#94a3b8] hover:text-white"
      >
        <ArrowLeft className="h-5 w-5 mr-2" />
        Back to Documents
      </Link>

      {document && (
        <DocumentViewer
          document={document}
          onDelete={() => router.push('/documents')}
        />
      )}
    </div>
  );
}
