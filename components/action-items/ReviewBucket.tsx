'use client';
import { ReviewItemCard, type ReviewDecision } from './ReviewItemCard';
import type { ReviewableItem } from '@/lib/action-items/resolution/resolve';

interface UserOption { id: string; name: string; agency: string | null; }

export function ReviewBucket({
  title, items, defaultAction, ownerOptions, decisions, setDecision, collapsed,
}: {
  title: string;
  items: Array<{ index: number; item: ReviewableItem }>;
  defaultAction: 'accept' | 'reject';
  ownerOptions: UserOption[];
  decisions: Map<number, ReviewDecision>;
  setDecision: (d: ReviewDecision) => void;
  collapsed?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <details open={!collapsed} className="space-y-2">
      <summary className="cursor-pointer text-base font-semibold">
        {title} <span className="text-xs text-navy-600">({items.length})</span>
      </summary>
      <div className="space-y-2 mt-2">
        {items.map(({ index, item }) => (
          <ReviewItemCard
            key={index} index={index} item={item}
            ownerOptions={ownerOptions} defaultAction={defaultAction}
            decision={decisions.get(index) ?? null}
            onChange={setDecision}
          />
        ))}
      </div>
    </details>
  );
}
