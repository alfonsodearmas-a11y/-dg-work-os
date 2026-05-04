export interface SupersessionCandidate {
  task_id: string;
  title: string;
  created_at: string;
  score: number;
}

export function SupersessionSuggestion({ candidates }: { candidates: SupersessionCandidate[] }) {
  if (!candidates || candidates.length === 0) return null;
  return (
    <div className="text-xs text-gold-500 border-l-2 border-gold-500 pl-2">
      May supersede:
      <ul className="mt-1 space-y-0.5">
        {candidates.map(c => (
          <li key={c.task_id}>
            <a href={`/tasks?focus=${c.task_id}`} className="underline">{c.title}</a>
            <span className="text-navy-600"> ({(c.score * 100).toFixed(0)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
