export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-36 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
