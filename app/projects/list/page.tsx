'use client';

// This page now redirects to the main /projects page which has the full table + filters
import { redirect } from 'next/navigation';

export default function ProjectListPage() {
  redirect('/projects');
}
