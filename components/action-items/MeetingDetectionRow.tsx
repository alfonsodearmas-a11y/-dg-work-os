'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MEETING_TYPES, MODALITIES, type MeetingType, type Modality } from '@/lib/action-items/constants';
import { ProcessManuallyButton } from './ProcessManuallyButton';

export interface MeetingRow {
  id: string;
  fireflies_meeting_id: string;
  meeting_title: string | null;
  meeting_date: string | null;
  detected_type: MeetingType | null;
  detected_modality: Modality | null;
  pipeline_action: 'extracted' | 'skipped_out_of_scope' | 'queued' | 'failed' | 'manually_processed';
  skip_reason: string | null;
}

export function MeetingDetectionRow({ row }: { row: MeetingRow }) {
  const router = useRouter();
  const [t, setT] = useState<MeetingType | null>(row.detected_type);
  const [m, setM] = useState<Modality | null>(row.detected_modality);
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/action-items/meetings/${row.id}/override`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <tr className="border-b border-navy-800">
      <td className="px-2 py-2 text-xs">
        <div className="text-white">{row.meeting_title ?? '(untitled)'}</div>
        <div className="text-navy-600">{row.meeting_date ? new Date(row.meeting_date).toLocaleString() : ''}</div>
      </td>
      <td className="px-2 py-2">
        <select value={t ?? ''} disabled={busy}
          onChange={e => { const v = (e.target.value || null) as MeetingType | null; setT(v); patch({ detected_type: v }); }}
          className="bg-navy-900 border border-navy-800 rounded px-1 py-0.5 text-xs">
          <option value="">—</option>
          {MEETING_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <select value={m ?? ''} disabled={busy}
          onChange={e => { const v = (e.target.value || null) as Modality | null; setM(v); patch({ detected_modality: v }); }}
          className="bg-navy-900 border border-navy-800 rounded px-1 py-0.5 text-xs">
          <option value="">—</option>
          {MODALITIES.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </td>
      <td className="px-2 py-2 text-xs">
        <span className={`uppercase ${row.pipeline_action === 'failed' ? 'text-red-500' : 'text-navy-600'}`}>
          {row.pipeline_action.replace(/_/g, ' ')}
        </span>
        {row.skip_reason && <div className="text-[10px] text-navy-600">{row.skip_reason}</div>}
      </td>
      <td className="px-2 py-2 text-right">
        <ProcessManuallyButton
          meetingId={row.fireflies_meeting_id}
          meetingTitle={row.meeting_title}
          meetingDate={row.meeting_date}
        />
      </td>
    </tr>
  );
}
