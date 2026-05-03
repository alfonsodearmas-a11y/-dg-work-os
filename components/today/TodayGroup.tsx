'use client';

import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { TodaySignalCard } from './TodaySignalCard';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { GroupedSignal } from './grouping';

export function TodayGroup({ group, firstLoadOpen }: { group: GroupedSignal; firstLoadOpen: boolean }) {
  const [open, setOpen] = useLocalStorage<boolean>(`today.group.${group.key}.open`, firstLoadOpen);

  return (
    <CollapsibleSection
      title={group.label}
      icon={group.icon}
      badge={{ text: String(group.rollupAwareCount) }}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="space-y-2">
        {group.items.map((s) => (
          <TodaySignalCard key={s.id} signal={s} />
        ))}
      </div>
    </CollapsibleSection>
  );
}
