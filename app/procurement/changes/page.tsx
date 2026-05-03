import { permanentRedirect } from 'next/navigation';

// Phase 2: /procurement/changes collapses into /procurement/activity, which
// merges field changes with presence events and decisions in one chronological
// audit feed.
export default function ChangesPage(): never {
  permanentRedirect('/procurement/activity');
}
