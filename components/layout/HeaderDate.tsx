'use client';

export function HeaderDate() {
  const now = new Date();

  return (
    <>
      {/* Desktop: full date */}
      <div className="text-right hidden md:block">
        <p className="text-white/60 text-xs font-light tracking-wide">
          {now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
      {/* Mobile: abbreviated date */}
      <p className="md:hidden text-white/50 text-xs">
        {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>
    </>
  );
}
