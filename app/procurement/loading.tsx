export default function ProcurementLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-52 rounded-lg" />
        <div className="flex gap-2">
          <div className="skeleton h-9 w-24 rounded-lg" />
          <div className="skeleton h-9 w-9 rounded-lg" />
        </div>
      </div>
      <div className="skeleton h-10 w-full rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="skeleton h-6 w-24 rounded" />
            {[...Array(3)].map((_, j) => (
              <div key={j} className="skeleton h-28 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
