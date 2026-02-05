'use client';

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';

interface AgencyData {
  agency: string;
  total: number;
  completed: number;
  in_progress: number;
  delayed: number;
  cancelled: number;
  total_value: number;
  avg_completion: number;
}

interface AgencySummaryProps {
  data: AgencyData[];
}

function formatCurrency(value: number): string {
  if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(1)}B`;
  }
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  }
  return `$${value.toLocaleString()}`;
}

export function AgencySummary({ data }: AgencySummaryProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agency</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Done</TableHead>
          <TableHead className="text-right">Active</TableHead>
          <TableHead className="text-right">Delayed</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Avg. Completion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.agency}>
            <TableCell className="font-medium">{row.agency}</TableCell>
            <TableCell className="text-right">{row.total}</TableCell>
            <TableCell className="text-right">
              <Badge variant="success">{row.completed}</Badge>
            </TableCell>
            <TableCell className="text-right">
              <Badge variant="info">{row.in_progress}</Badge>
            </TableCell>
            <TableCell className="text-right">
              {row.delayed > 0 ? (
                <Badge variant="danger">{row.delayed}</Badge>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </TableCell>
            <TableCell className="text-right">{formatCurrency(row.total_value)}</TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end space-x-2">
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${Math.min(row.avg_completion, 100)}%` }}
                  />
                </div>
                <span className="text-sm">{row.avg_completion.toFixed(0)}%</span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
