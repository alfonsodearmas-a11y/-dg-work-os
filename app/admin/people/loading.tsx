export default function PeopleLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-32 rounded-lg" />
        <div className="skeleton h-9 w-28 rounded-lg" />
      </div>
      <div className="skeleton h-10 w-full rounded-lg" />
      <div className="space-y-1">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="skeleton h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
