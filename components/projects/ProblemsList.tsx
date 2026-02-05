'use client';

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { AlertTriangle } from 'lucide-react';

const AGENCY_COLORS: Record<string, string> = {
  'GPL': 'bg-yellow-100 text-yellow-800',
  'GWI': 'bg-blue-100 text-blue-800',
  'HECI': 'bg-green-100 text-green-800',
  'CJIA': 'bg-purple-100 text-purple-800',
  'MARAD': 'bg-cyan-100 text-cyan-800',
  'GCAA': 'bg-orange-100 text-orange-800',
  'MOPUA': 'bg-pink-100 text-pink-800',
  'HAS': 'bg-indigo-100 text-indigo-800',
};

interface Project {
  project_reference: string;
  project_name: string;
  sub_agency: string | null;
  completion_percent: number | null;
  spend_percent: number;
  variance: number;
}

interface ProblemsListProps {
  projects: Project[];
}

export function ProblemsList({ projects }: ProblemsListProps) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No problem projects identified
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Agency</TableHead>
          <TableHead className="text-right">Spent %</TableHead>
          <TableHead className="text-right">Complete %</TableHead>
          <TableHead className="text-right">Variance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.project_reference}>
            <TableCell className="max-w-xs">
              <p className="font-medium truncate">{project.project_name}</p>
              <p className="text-xs text-gray-500 font-mono">{project.project_reference}</p>
            </TableCell>
            <TableCell>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${AGENCY_COLORS[project.sub_agency || ''] || 'bg-gray-100 text-gray-800'}`}>
                {project.sub_agency || '-'}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-red-600 font-medium">
                {project.spend_percent.toFixed(0)}%
              </span>
            </TableCell>
            <TableCell className="text-right">
              {project.completion_percent?.toFixed(0) || 0}%
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end space-x-1 text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">+{project.variance.toFixed(0)}%</span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
