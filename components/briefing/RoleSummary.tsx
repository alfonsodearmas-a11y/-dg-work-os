'use client';

interface RoleSummaryProps {
  data: Record<string, any[]>;
}

export function RoleSummary({ data }: RoleSummaryProps) {
  const sortedEntries = Object.entries(data).sort((a, b) => b[1].length - a[1].length);
  const maxCount = sortedEntries.length > 0 ? sortedEntries[0][1].length : 1;

  return (
    <div className="space-y-3">
      {sortedEntries.map(([name, tasks]) => (
        <div key={name}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-700">{name}</span>
            <span className="text-gray-500">{tasks.length} tasks</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(tasks.length / maxCount) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {sortedEntries.length === 0 && (
        <p className="text-gray-500 text-sm">No data available</p>
      )}
    </div>
  );
}
