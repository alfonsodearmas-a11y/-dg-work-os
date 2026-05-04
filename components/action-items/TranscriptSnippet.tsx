export function TranscriptSnippet({ text, focusTimestamp }: { text: string; focusTimestamp?: string }) {
  return (
    <pre className="text-xs bg-navy-900 border border-navy-800 rounded p-3 max-h-[70vh] overflow-auto whitespace-pre-wrap font-mono">
      {focusTimestamp ? `[focused at ${focusTimestamp}]\n\n` : ''}{text}
    </pre>
  );
}
