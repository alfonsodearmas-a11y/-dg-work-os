'use client';

import { useState, useCallback, type DragEvent } from 'react';

interface UseDropZoneOptions {
  onFileDrop: (files: File[]) => void;
  accept?: string[];
}

export function useDropZone({ onFileDrop, accept }: UseDropZoneOptions) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (accept && accept.length > 0) {
      const filtered = files.filter(f =>
        accept.some(ext => f.name.toLowerCase().endsWith(ext.toLowerCase()))
      );
      if (filtered.length > 0) onFileDrop(filtered);
    } else {
      onFileDrop(files);
    }
  }, [onFileDrop, accept]);

  return {
    isDragging,
    dropZoneProps: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
