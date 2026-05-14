# Follow-ups from the Pending Applications fix (2026-05-14)

These items were flagged during the GWI metrics investigation but kept out of scope per the approved plan. Each is independently actionable. File issues or pick them up later as standalone PRs.

## 1. GPL reingest

GPL pending_applications is stale. `data_as_of` is 2026-03-04 and the last successful ingest was 2026-05-04, which means the row set itself is 71 days old. After migration 111 ships, GPL `days_waiting` will recompute live for whichever rows are still in the table, but the row set will continue to include applications that may already have been completed.

Action: request a fresh GPL extract from GPL ops and run it through the Upload tab before the next executive briefing. No code change required.

## 2. process/route.ts transactional safety

`app/api/pending-applications/process/route.ts` lines 204 to 235 perform a `DELETE FROM pending_applications WHERE agency = X` followed by a batched INSERT. Both calls go through the Supabase JS client, which gives no transactional guarantee. If the DELETE succeeds and any INSERT batch fails, the agency is left with zero rows in the table and the UI shows "0 pending" until the next successful upload. Today there is per-batch error logging but no rollback.

Action: rewrite as a single Postgres transaction via a Supabase RPC, or stage to a temporary table and swap with a single rename. Risk class: complete data loss for an agency on a failed reingest.

## 3. Snapshot values for GWI files without DAYS_DIFFERENCE

`lib/pending-applications-snapshots.ts` computes `avgDaysWaiting`, `maxDaysWaiting`, and `over30Count` for `pending_application_snapshots` from `records.days_waiting` at parse time. For GWI files that have no DAYS_DIFFERENCE column (the current shape of the extract), every record has `days_waiting = 0`, so when this was filed the 2026-05-14 GWI snapshot read `total_count: 110, avgDaysWaiting: 0, maxDaysWaiting: 0, over30Count: 0`. The Trend Charts on the Overview tab feed off this table.

**Partial resolution:** migration 112 UPDATEd that one stuck row in place using the live view aggregates. The underlying bug in `createSnapshot()` is unchanged, so every future GWI upload whose extract lacks DAYS_DIFFERENCE will write another zeroed snapshot row.

Action: in `createSnapshot()`, compute days as `(snapshotDate - record.application_date)` when the parsed value is 0 or absent. Or, better, drop the JS aggregation entirely and SELECT from `pending_applications_with_wait` after the upsert.

## 4. migrations/042_pending_applications.sql header comment

The comment in `supabase/migrations/042_pending_applications.sql` says the `pending_applications` name was taken by migration 030. That is incorrect: the original `pending_applications` table is created in migration 016, and migration 042 introduces a separate `customer_applications` table. Confusing for future devs reading the migrations folder.

Action: rewrite the leading comment in 042 to reference migration 016, or fold the explanation into a top-level docs/ note.

## 5. page.tsx bare auth() to requireRole()

`app/intel/pending-applications/page.tsx` line 7 still calls `auth()` directly with a `// TODO: migrate to requireRole()` comment. All the API routes under this module are on `requireRole`, so the page-level gate is the last bare-auth caller in the module.

Action: switch to `requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer'])`. Verify the GPL-only restriction still works because that branch lives in `PendingApplicationsClient` and reads from the session, not from the page.

## 6. Per-record dataAsOf field semantics

The `PendingApplication.dataAsOf` field on the row drawers shows whatever the parser stamped on the row, which is `today()` at parse time when the GWI title row regex misses. The drawers say things like "Data As Of: May 14, 2026" for every GWI record, which is technically correct but misleading. The Overview header now uses honest `reportThrough` and `uploadedAt` labels; the drawers were intentionally left alone in this PR to keep the diff tight.

Action: replace the per-record "Data As Of" line in the GWI and GPL drawers with the agency's `reportThrough` and `uploadedAt`, or drop the line entirely. The same field appears in `components/intel/pending-applications/OverviewTab.tsx:506`, `GWIAnalysisPanel.tsx:477`, and `GPLAnalysisPanel.tsx:512`.

## 7. GWI parser title-row regex coverage

`parseGWIBuffer` extracts `dataAsOf` from the title cell with a regex requiring the literal word "to" plus a spelled-out month, day, and 4-digit year. The May 8 extract evidently does not match this pattern because the stored `dataAsOf` came back as today (2026-05-14). The view in migration 111 makes this stamp non-load-bearing for the dashboard, but it still drives the upload confirmation toast and the per-record drawer.

Action: widen the regex, or get the actual title-row text from GWI ops and add the literal pattern. Low priority since `reportThrough` is now derived from MAX(application_date), which is honest.

## 8. Storage-path bug recurs anywhere file.name is interpolated

`app/api/pending-applications/upload/route.ts` no longer puts `file.name` in the storage path, which fixes the supabase-js download lookup failure for filenames with parens. The same antipattern (interpolating raw `file.name` into a storage key) still exists in other upload paths in the repo and will silently break for filenames with parens or other URL-special characters. PSIP uploads under bucket `psip-uploads` are the obvious next candidate; the Storage logs show recent PSIP keys with literal spaces and dashes that have not yet hit the parens case.

Action: grep for `.storage.from(...).upload(` and audit each callsite. Apply the same fix: drop the original filename, use `{fileId}.{ext}`. Track the original filename in the response payload or in a separate metadata table if it's needed downstream.

## 9. process route error message conflates two failure modes

`app/api/pending-applications/process/route.ts:181` returns "File not found or expired. Please upload again." whenever `supabaseAdmin.storage.from(BUCKET).download(storagePath)` returns an error. That branch fires for two very different conditions:
  - the storage object genuinely does not exist or was deleted
  - the supabase-js client could not even issue the GET request (the parens bug fixed in commit `fd18e6b` looked exactly like this, and the misleading message made it look like a TTL / cleanup race for hours)

Action: include `dlError.message` (or a sanitized version of it) in the response body so the UI can show "Could not read uploaded file: <reason>". Cuts the next debugging session of this class from hours to minutes.
