'use client';
import { useMemo, useState } from 'react';
import { MeetingDetectionRow, type MeetingRow } from './MeetingDetectionRow';
import { MEETING_TYPES, PIPELINE_ACTIONS, type MeetingType, type PipelineAction } from '@/lib/action-items/constants';

export function MeetingsList({ rows }: { rows: MeetingRow[] }) {
  const [actionFilter, setActionFilter] = useState<PipelineAction | ''>('');
  const [typeFilter, setTypeFilter] = useState<MeetingType | 'unclassified' | ''>('');

  const filtered = useMemo(() => rows.filter(r =>
    (!actionFilter || r.pipeline_action === actionFilter)
    && (!typeFilter ||
        (typeFilter === 'unclassified' ? r.detected_type === null : r.detected_type === typeFilter))
  ), [rows, actionFilter, typeFilter]);

  return (
    <div className="space-y-3">
      <div className="flex gap-3 text-xs">
        <label>Action:
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value as PipelineAction | '')}
            className="ml-2 bg-navy-900 border border-navy-800 rounded px-2 py-1">
            <option value="">all</option>
            {PIPELINE_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>Type:
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as MeetingType | 'unclassified' | '')}
            className="ml-2 bg-navy-900 border border-navy-800 rounded px-2 py-1">
            <option value="">all</option>
            <option value="unclassified">unclassified</option>
            {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <span className="text-navy-600 ml-auto">{filtered.length} of {rows.length}</span>
      </div>
      <div className="border border-navy-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-navy-600 text-xs uppercase">
            <tr>
              <th className="px-2 py-2 text-left">Meeting</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">Modality</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>{filtered.map(r => <MeetingDetectionRow key={r.id} row={r} />)}</tbody>
        </table>
      </div>
    </div>
  );
}
