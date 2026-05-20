'use client';

import { useEffect, useState } from 'react';

export function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

interface GreetingHeadingProps {
  userName: string;
}

export function GreetingHeading({ userName }: GreetingHeadingProps) {
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    setGreeting(getGreeting(new Date()));
  }, []);

  return (
    <h1 className="mt-2 text-3xl lg:text-4xl font-bold text-white tracking-tight">
      {greeting ? `${greeting}, ` : ''}
      <span className="text-gold-500">{userName}</span>
    </h1>
  );
}
