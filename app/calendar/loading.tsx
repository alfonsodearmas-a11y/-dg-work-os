export default function CalendarLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-40 rounded-lg" />
        <div className="flex gap-2">
          <div className="skeleton h-9 w-9 rounded-lg" />
          <div className="skeleton h-9 w-28 rounded-lg" />
          <div className="skeleton h-9 w-9 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px">
        {[...Array(7)].map((_, i) => (
          <div key={`h-${i}`} className="skeleton h-8 rounded" />
        ))}
        {[...Array(35)].map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
