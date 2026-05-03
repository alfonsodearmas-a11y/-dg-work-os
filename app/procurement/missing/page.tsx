import { permanentRedirect } from 'next/navigation';

// Phase 2: /procurement/missing collapses into the unified Decisions Required
// inbox. Missing-pending-decision tenders surface there alongside ambiguous
// reviews. /procurement/archived remains as the dedicated read-only archive
// view (it is not action-required).
export default function MissingPage(): never {
  permanentRedirect('/procurement/inbox');
}
