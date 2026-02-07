'use client';

// Problems = Delayed projects — redirect to the delayed page
import { redirect } from 'next/navigation';

export default function ProblemProjectsPage() {
  redirect('/projects/delayed');
}
