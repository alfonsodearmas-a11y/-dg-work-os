'use client';

import { format, formatDistanceToNow, isPast } from 'date-fns';
import { Edit2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface Task {
  notion_id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  assignee: string | null;
  agency: string | null;
  role: string | null;
  priority: string | null;
}

interface TaskListProps {
  tasks: Task[];
  showOverdueInfo?: boolean;
  showDueDate?: boolean;
  onEdit?: (task: Task) => void;
}

export function TaskList({ tasks, showOverdueInfo, showDueDate, onEdit }: TaskListProps) {
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div
          key={task.notion_id}
          className={`flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${onEdit ? 'cursor-pointer' : ''}`}
          onClick={() => onEdit?.(task)}
        >
          <div className="flex-shrink-0 pt-0.5">
            <input
              type="checkbox"
              className="h-4 w-4 text-blue-600 rounded border-gray-300"
              checked={task.status === 'Done'}
              readOnly
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {task.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {task.agency && (
                <Badge variant="info">{task.agency}</Badge>
              )}
              {task.role && (
                <Badge variant="default">{task.role}</Badge>
              )}
              {task.priority === 'High' && (
                <Badge variant="danger">High Priority</Badge>
              )}
              {task.priority === 'Medium' && (
                <Badge variant="warning">Medium</Badge>
              )}
              {task.status && task.status !== 'To do' && (
                <Badge variant={task.status === 'Done' ? 'success' : 'default'}>{task.status}</Badge>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center space-x-2">
            {showOverdueInfo && task.due_date && (
              <p className="text-sm text-red-600 font-medium">
                {formatDistanceToNow(new Date(task.due_date))} overdue
              </p>
            )}
            {showDueDate && task.due_date && (
              <p className={`text-sm ${isPast(new Date(task.due_date)) ? 'text-red-600' : 'text-gray-500'}`}>
                {format(new Date(task.due_date), 'MMM d')}
              </p>
            )}
            {onEdit && (
              <Edit2 className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
