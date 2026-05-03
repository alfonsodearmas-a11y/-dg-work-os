import { permanentRedirect } from 'next/navigation';

// Phase 2: /procurement/review collapses into the unified Decisions Required
// inbox. Action-required surfaces all live at /procurement/inbox now.
export default function ReviewPage(): never {
  permanentRedirect('/procurement/inbox');
}
