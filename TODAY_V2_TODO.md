# Today v2 follow-ups

## 1. Tender `days_at_current_stage` understates time in stage

**Symptom.** `/api/today` returns zero tender SLA breaches even when procurement
rows look visibly stuck. Spot-checked 2026-04-21 against 79 non-rollover,
non-missing tenders: zero breaches reported.

**Why.** `enrichTender` in `lib/tender/queries.ts` computes:

```
days_at_current_stage = days since (latest tender_field_change for field_name='stage')
                       else days since tender.updated_at
                       else days since tender.created_at
```

The fallback to `updated_at` is the problem. `tender.updated_at` is bumped by
the `trg_tender_updated_at` trigger on *any* column update — a description
edit, a contractor change, a remarks tweak, or a re-ingest from the weekly
PSIP xlsx that touches any field. Those unrelated writes reset the apparent
time-in-stage even though the stage itself has not changed.

In practice most tenders have no `tender_field_change` row with
`field_name='stage'` because stage transitions happen implicitly via PSIP
ingest rather than explicit API calls, so the fallback is the common path,
not the exception.

**Affected code.**
- `lib/tender/queries.ts` — `enrichTender` (fallback logic) and
  `fetchLatestStageChangeMap` (the "latest stage change" lookup that feeds it).
- Downstream: `lib/today/signals.ts::fetchTenderSlaSignals` — consumes
  `days_at_current_stage` directly.

**Real fix.**
1. Guarantee a `tender_field_change` row with `field_name='stage'` every time
   a tender's stage changes, including during PSIP ingest. Today this is only
   written when stage is set via `createManualTender` or `updateTenderStage`;
   PSIP ingest can set/change stage without writing a change row.
2. Once ingest emits stage change rows, remove the `updated_at` fallback in
   `enrichTender` and fall back to `created_at` alone (or return `null` and
   let callers decide).
3. Backfill: seed a `tender_field_change` row for every existing tender at
   `changed_at = created_at` with `new_value = { stage }` so the lookup
   always has something to find. Then `days_at_current_stage = now - changed_at`
   is well-defined for every row.

**Tests to add after fix.**
- `lib/tender/__tests__/queries.test.ts` — assert `enrichTender` does not
  fall back to `updated_at` when a stage change row exists; assert it uses
  `created_at` when no change row exists.
- `lib/today/__tests__/signals.test.ts` — add a fixture with a tender that
  has `updated_at = today` but `tender_field_change.changed_at = 60 days ago`
  and assert the signal fires as a breach.

**Do not fix in Today v1.** Shipping Today v1 with a known 0-breach state is
acceptable — the data is currently honest (just uninformative). Fix when the
procurement reformulation's ingest pipeline is the right place to touch.
