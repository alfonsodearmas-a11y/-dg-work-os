'use client';

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';

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
  contract_value: number | null;
  contractor: string | null;
}

interface DelayedListProps {
  projects: Project[];
}

function formatCurrency(value: number | null): string {
  if (!value) return '-';
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  }
  return `$${value.toLocaleString()}`;
}

export function DelayedList({ projects }: DelayedListProps) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No delayed projects found
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reference</TableHead>
          <TableHead>Agency</TableHead>
          <TableHead>Project Name</TableHead>
          <TableHead className="text-right">Progress</TableHead>
          <TableHead className="text-right">Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.project_reference}>
            <TableCell className="font-mono text-xs">
              {project.project_reference}
            </TableCell>
            <TableCell>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${AGENCY_COLORS[project.sub_agency || ''] || 'bg-gray-100 text-gray-800'}`}>
                {project.sub_agency || '-'}
              </span>
            </TableCell>
            <TableCell className="max-w-xs">
              <span className="line-clamp-2" title={project.project_name}>
                {project.project_name}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end space-x-2">
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{ width: `${project.completion_percent || 0}%` }}
                  />
                </div>
                <span className="text-sm">{project.completion_percent?.toFixed(0) || 0}%</span>
              </div>
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(project.contract_value)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
