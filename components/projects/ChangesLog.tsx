'use client';

import { AlertTriangle, TrendingUp, Plus, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface Changes {
  new_projects: any[];
  status_changes: Array<{
    project_reference: string;
    project_name: string;
    sub_agency: string | null;
    from_status: string | null;
    to_status: string | null;
  }>;
  completion_changes: Array<{
    project_reference: string;
    project_name: string;
    sub_agency: string | null;
    from_percent: number | null;
    to_percent: number | null;
    delta: number;
  }>;
  expenditure_changes: Array<{
    project_reference: string;
    project_name: string;
    delta: number;
  }>;
}

interface ChangesLogProps {
  changes: Changes | null;
}

function formatCurrency(value: number): string {
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  }
  return `$${value.toLocaleString()}`;
}

export function ChangesLog({ changes }: ChangesLogProps) {
  if (!changes) {
    return (
      <div className="text-center py-8 text-gray-500">
        Upload an Excel file to see changes
      </div>
    );
  }

  const hasChanges =
    changes.new_projects.length > 0 ||
    changes.status_changes.length > 0 ||
    changes.completion_changes.length > 0 ||
    changes.expenditure_changes.length > 0;

  if (!hasChanges) {
    return (
      <div className="text-center py-8 text-gray-500">
        No changes detected in the latest upload
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* New Projects */}
      {changes.new_projects.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 flex items-center mb-3">
            <Plus className="h-4 w-4 mr-2 text-green-600" />
            New Projects ({changes.new_projects.length})
          </h3>
          <div className="space-y-2">
            {changes.new_projects.slice(0, 5).map((project: any) => (
              <div key={project.project_reference} className="p-2 bg-green-50 rounded text-sm">
                <span className="font-medium">{project.project_name}</span>
                <span className="text-gray-500 ml-2">({project.sub_agency})</span>
              </div>
            ))}
            {changes.new_projects.length > 5 && (
              <p className="text-sm text-gray-500">
                +{changes.new_projects.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Status Changes */}
      {changes.status_changes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 flex items-center mb-3">
            <AlertTriangle className="h-4 w-4 mr-2 text-yellow-600" />
            Status Changes ({changes.status_changes.length})
          </h3>
          <div className="space-y-2">
            {changes.status_changes.slice(0, 5).map((change) => (
              <div key={change.project_reference} className="p-2 bg-yellow-50 rounded text-sm flex items-center justify-between">
                <span className="truncate flex-1">{change.project_name}</span>
                <div className="flex items-center space-x-2 ml-2">
                  <Badge variant="default">{change.from_status || '?'}</Badge>
                  <span>→</span>
                  <Badge variant={change.to_status === 'DELAYED' ? 'danger' : 'success'}>
                    {change.to_status || '?'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion Changes */}
      {changes.completion_changes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 flex items-center mb-3">
            <TrendingUp className="h-4 w-4 mr-2 text-blue-600" />
            Completion Changes ({changes.completion_changes.length})
          </h3>
          <div className="space-y-2">
            {changes.completion_changes.slice(0, 5).map((change) => (
              <div key={change.project_reference} className="p-2 bg-blue-50 rounded text-sm flex items-center justify-between">
                <span className="truncate flex-1">{change.project_name}</span>
                <span className={change.delta > 0 ? 'text-green-600' : 'text-red-600'}>
                  {change.delta > 0 ? '+' : ''}{change.delta.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expenditure Changes */}
      {changes.expenditure_changes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 flex items-center mb-3">
            <DollarSign className="h-4 w-4 mr-2 text-purple-600" />
            New Expenditure ({formatCurrency(changes.expenditure_changes.reduce((sum, c) => sum + c.delta, 0))} total)
          </h3>
          <p className="text-sm text-gray-500">
            {changes.expenditure_changes.length} projects with new expenditure recorded
          </p>
        </div>
      )}
    </div>
  );
}
