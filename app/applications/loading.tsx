export default function ApplicationsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-44 rounded-lg" />
        <div className="skeleton h-9 w-28 rounded-lg" />
      </div>
      <div className="flex gap-3">
        <div className="skeleton h-10 flex-1 rounded-lg" />
        <div className="skeleton h-10 w-28 rounded-lg" />
      </div>
      <div className="space-y-1">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="skeleton h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
