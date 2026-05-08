# Procurement Review Queue — Investigation Report

Scope: read-only audit of the PSIP ingestion pipeline and the three review surfaces (Missing Tenders, What Moved, Review Queue / Missing Stage). Every claim cites file:line. No code changes were made.

---

## 1. Ingestion Pipeline

### 1.1 End-to-end trace

| Step | File | Symbol | Lines |
|---|---|---|---|
| Upload route (preview & apply entry) | `app/api/procurement/uploads/route.ts` | `POST` | 36–103 |
| Preview orchestrator | `lib/psip/ingest.ts` | `previewPsipUpload` | 51–120 |
| Apply orchestrator | `lib/psip/ingest.ts` | `applyPsipUpload` | 124–258 |
| xlsx → rows parser | `lib/psip/parser.ts` | `parsePsipWorkbook` | 256–466 |
| Row → ParsedTender builder | `lib/psip/parser.ts` | `buildTenderFromRow` | 477–546 |
| Stage resolver | `lib/psip/parser.ts` | `resolveStage` | 133–196 |
| Method normalizer | `lib/psip/parser.ts` | `normalizeMethod` | 83–98 |
| Diff/match planner | `lib/psip/matcher.ts` | `matchTenders` | 177–302 |
| Field-level diff | `lib/psip/matcher.ts` | `fieldDiffs` | 144–154 |
| Existing-row hydration | `lib/psip/ingest.ts` | `fetchExistingSnapshots` | 273–288 |
| Insert (NEW) | `lib/psip/ingest.ts` | `insertNewTender` | 290–335 |
| Update (UPDATE) | `lib/psip/ingest.ts` | `applyUpdate` | 337–401 |
| Snapshot/freshness | `lib/psip/ingest.ts` | `recordFreshnessSnapshots` | 421–504 |
| Review-queue insert | `lib/psip/ingest.ts` | (in `previewPsipUpload`) | 75–98 |
| Missing flag write | `lib/psip/ingest.ts` | (in `applyPsipUpload`) | 198–214 |

The flow:

1. UI POSTs `multipart/form-data` to `app/api/procurement/uploads/route.ts` (line 47). File is stashed in Supabase Storage bucket `psip-uploads` (54), then `previewPsipUpload` is called with the buffer (63).
2. `previewPsipUpload` (`lib/psip/ingest.ts:51`) parses the workbook (line 52), fetches a snapshot of every PSIP-sourced tender (53), runs `matchTenders` (54), persists an `upload` row in `'preview'` state (57–70), and inserts `tender_match_review` rows for every result whose `kind === 'review'` (75–98). Note: at preview time only `tender_match_review` and `upload` are written — `tender` and `tender_field_change` are untouched.
3. The user clicks Apply → `POST /api/procurement/uploads` with `{ upload_id, action: 'apply' }` (line 71–97) → `applyPsipUpload` (line 124). This re-parses + re-matches the workbook (146–148), inserts new tenders, applies updates with field-change rows, flips `missing_from_last_upload=true` for unmatched existing rows, snapshots freshness, runs event nags, then marks the upload `applied` (230–247).
4. The Apply re-match is **not** read from the preview's `tender_match_review` rows — `tender_match_review` rows are passed through (`// REVIEW rows are left as pending` — `lib/psip/ingest.ts:194`). Whatever was queued at preview stays queued post-apply, awaiting human action via `app/api/procurement/review/[id]/route.ts`.

### 1.2 Classification predicates (quoted)

#### "Missing tender" predicate

`lib/psip/matcher.ts:298`:

```ts
const missing = existing.filter((e) => e.source === 'psip' && !matchedIds.has(e.id));
```

Where `matchedIds` is populated only on `'update'` results (matcher.ts:239 and 283). Trello/manual rows are excluded by construction. The flip is then committed in `lib/psip/ingest.ts:198–203`:

```ts
const missingIds = plan.missing.map((m) => m.id);
if (missingIds.length > 0) {
  await supabaseAdmin.from('tender').update({ missing_from_last_upload: true }).in('id', missingIds);
```

#### "Moved" / changed-field predicate

`lib/psip/matcher.ts:144–154` (`fieldDiffs`):

```ts
for (const f of DIFFABLE_FIELDS) {
  const nVal = incoming[f as keyof ParsedTender];
  const oVal = existing[f as keyof ExistingTenderSnapshot];
  if (!equal(oVal, nVal)) {
    diffs.push({ field: f, old: oVal, new: nVal });
  }
}
```

`equal` is loose: `String(a) === String(b)` after `null/undefined` collapse (matcher.ts:137–142). It does **no** date normalization, **no** numeric tolerance, **no** case-insensitive compare, **no** whitespace collapse on the diff side. (Freshness diff in `lib/tender/freshness.ts` does all three, but that path is only used for `stagnant_weeks`, not for `tender_field_change` rows.)

`DIFFABLE_FIELDS` (matcher.ts:26–48) covers 20 fields including `description`, `stage`, `programme_activity`, dates, contractor, implementation pct, remarks.

#### "Missing stage" / "ambiguous_stage" predicate

`lib/psip/parser.ts:175–184` (in `resolveStage`):

```ts
if (!normalized && !hasAnyDate) {
  return {
    stage: 'design', // provisional — row will be queued for review, not ingested
    stageSource: 'inferred_from_dates',
    isRollover: false,
    hasException: false,
    normalizedLowercase,
    needsStageReview: true,
  };
}
```

Routed to review at `lib/psip/matcher.ts:211–214`:

```ts
if (inc.needs_stage_review) {
  pushReview(results, stats, inc, [], 'ambiguous_stage');
  continue;
}
```

#### "Ambiguous match" predicate

`lib/psip/matcher.ts:22–23`:

```ts
export const MATCH_THRESHOLD_HIGH = 0.92;
export const MATCH_THRESHOLD_REVIEW = 0.8;
```

Branching at matcher.ts:254–291: scores in `[0.92, 1.0)` auto-update unless tied (in which case line_item_code is the tiebreaker — line 261–270, otherwise reviewed). Scores in `[0.80, 0.92)` go to review with the top three candidates (287–290). Below 0.80 is a NEW row (293).

### 1.3 Data model

From `supabase/migrations/078_tender_core.sql`:

| Table | Lines | Key columns |
|---|---|---|
| `programme` | 82–86 | `code` (PK), `name` |
| `sub_programme` | 88–100 | `code` (PK), `programme_code` (FK), `agency`, `is_excluded` |
| `upload` | 106–116 | `id`, `filename`, `storage_path`, `status` (enum: preview/applied/cancelled), `stats` JSONB |
| `tender` | 127–169 | `source` (psip/trello/manual), `agency`, `description`, `stage`, `stage_source`, `method`, `is_rollover`, `has_exception`, 5 PSIP dates, `contractor`, `implementation_*`, `last_raw_row` JSONB, `first_seen_upload_id`, `last_seen_upload_id`, `missing_from_last_upload` |
| `tender_field_change` | 189–198 | `tender_id` (FK CASCADE), `field_name` (TEXT, free-form), `old_value`/`new_value` JSONB, `upload_id` |
| `tender_match_review` | 211–222 | `upload_id` (FK CASCADE), `incoming_row` JSONB, `candidate_tender_ids` UUID[], `scores` JSONB, `status` enum, `resolution_tender_id` |
| `tender_document` | 234–242 | `tender_id`, `file_name`, `file_path` |
| `tender_note` | 247–253 | `tender_id`, `content` |

Extension migrations:
- `082_tender_award_tracking.sql:15–17` adds `awarded_at TIMESTAMPTZ` and `first_appearance_already_awarded BOOLEAN`.
- `083_tender_match_review_reason.sql:11–13` adds `review_reason TEXT CHECK (review_reason IN ('ambiguous_match', 'ambiguous_stage'))`.
- `086_tender_freshness.sql:12–18` adds `tender_upload_snapshot (upload_id, tender_id) → snapshot_fields JSONB` plus `tender.stagnant_weeks INTEGER`.

Key observation: `tender_field_change.field_name` is plain TEXT with no enum/check constraint. Ingest writes both real column names AND sentinel values like `__created` (ingest.ts:160) and `__presence` (ingest.ts:208, missing/route.ts:46).

---

## 2. Missing Tenders Queue

### 2.1 Round-trip verification

The flow is exactly as expected:

- Identity: `matcher.ts:298` filters `existing` (from DB) for rows whose `id` is **not** in `matchedIds`, scoped to `source='psip'`.
- DB write: `ingest.ts:200–203` flips `missing_from_last_upload=true` and writes a sentinel field-change row with `field_name='__presence'`, `old='present'`, `new='missing'` (ingest.ts:204–213).
- Display: `app/api/procurement/missing/route.ts:16` calls `listMissingTenders`. That function (`lib/tender/queries.ts:506–510`) calls `listTenders({ includeMissing: true, includeRollovers: true })` and filters in JS by `t.missing_from_last_upload`.
- UI: `app/procurement/missing/page.tsx:64–80` renders Resurrect / Archive buttons.

### 2.2 Resurrect

`app/api/procurement/missing/route.ts:41–52`:

```ts
if (action === 'resurrect') {
  await supabaseAdmin.from('tender').update({ missing_from_last_upload: false }).eq('id', tenderId);
  await supabaseAdmin.from('tender_field_change').insert({
    tender_id: tenderId,
    field_name: '__presence',
    old_value: 'missing',
    new_value: 'present',
    upload_id: null,
    changed_by: session.user.id,
  });
  return NextResponse.json({ success: true, action: 'resurrect' });
}
```

It just unsets the flag. **No synthetic tender row is written.** The `last_seen_upload_id` is **not** touched, so the next upload that still doesn't see this tender will re-flag it `missing` (ingest.ts:200–203 has no exclusion for recently-resurrected rows). This is a hidden footgun: resurrect on Monday → next Monday's upload re-flags identical row → user does the same dance.

### 2.3 Archive

`app/api/procurement/missing/route.ts:54–60`:

```ts
if (action === 'archive') {
  if (session.user.role !== 'dg') {
    return NextResponse.json({ error: 'Only DG can archive tenders' }, { status: 403 });
  }
  await supabaseAdmin.from('tender').delete().eq('id', tenderId);
  return NextResponse.json({ success: true, action: 'archive' });
}
```

**Hard delete.** No `archived_at` column, no soft-delete pattern. `tender_field_change` and `tender_document`/`tender_note` rows go too via `ON DELETE CASCADE` (078_tender_core.sql:191, 236, 249). `tender_upload_snapshot` also cascades (086:14). Audit trail is lost. This is destructive and irreversible.

### 2.4 False-positive edge cases

Identity is established **only** by `scopeKey` + description similarity (matcher.ts:121–133, 205–293). Specifically:

1. **Agency/programme renaming** — `scopeKey = agency|programme_code|sub_programme_code|normalized(programme_activity)` (matcher.ts:127–132). If the agency moves a row from sub-programme `2611200` to `2611300`, the new row's scope key won't match any existing tender; the new row becomes NEW and the old row becomes MISSING. This is a **guaranteed double-report**: it will appear in both the Missing Tenders queue and as a NEW tender in the apply preview. Cross-scope fuzzy match is not attempted.
2. **Programme_activity rename** — same: the parent's column-B text is part of scope. Agency edits the parent description? Children orphan to MISSING.
3. **Description casing/whitespace** — `normalizeDescription` (parser.ts:550–552) lowercases, collapses whitespace, strips `.,;:()[]`. Good. So "Bartica  PVC" vs "bartica pvc" survive.
4. **Punctuation outside the strip-set** — apostrophes, dashes, slashes, ampersands are NOT stripped. "Black's Road" vs "Blacks Road" → distance ≥ 1. With ~12 chars that's a similarity ≈ 0.92, sitting on the threshold. `normalizeBidReference` is unused by the PSIP pipeline (data-cleaner.ts:136).
5. **Lot number / phase suffix** — "Phase I" → "Phase II" is a single-character difference at the end. levenshteinRatio depends on string length; for a 60-char description it's ~0.98 (auto-update — wrong stage propagation). For an 8-char description it's ~0.87 (ambiguous review — manual).
6. **Programme_code data-cleaning** — programme_code/sub-programme_code are pulled directly from cell A and string-compared. Excel could store these as numbers; `cleanTextField` (parser.ts:286, data-cleaner.ts:131) only trims/collapses but does not coerce numeric→string. If a future workbook stores `342` as a number, the regex `^3\d{2}$` (parser.ts:226) will still match because `String(342)` is `"342"`. OK.
7. **Trello fold-in** — matcher.ts:186 explicitly skips `e.source !== 'psip'`. Trello and manual rows are never matched against — meaning a row that exists in Trello AND appears in PSIP will be reported as a NEW psip tender, not deduped. (Visible in the duplicate symptom: HECI sub-programme `2606700` is excluded from PSIP entirely at parser.ts:59 and the explicit list at parser.ts:390, but if the user uploads a workbook where HECI rows leak past the exclusion, they'd be NEW here.)

---

## 3. What Moved View

### 3.1 Source

API: `app/api/procurement/changes/route.ts`. It picks the most recent applied upload (line 21–28), pulls every `tender_field_change` row whose `upload_id` matches (line 38–43), groups by tender, sorts stage diffs first (70–75), then groups by agency (76–78). UI: `app/procurement/changes/page.tsx:65–96` renders raw `field_name: old → new` lines via `fmtValue` (page.tsx:18–22), which JSON.stringifies any object value.

### 3.2 Change types currently rendered

Every entry in `tender_field_change` for the upload appears in this view. Types observed:

| Field | Source | Useful? |
|---|---|---|
| `__created` | ingest.ts:160 (NEW), review/[id]/route.ts:164 | **Duplicates the "New tenders" preview stat.** UI hides the diff arrow but still shows the row (changes/page.tsx:80–87). |
| `__presence` | ingest.ts:208 ('present'→'missing'), missing/route.ts:46 ('missing'→'present') | **Duplicates the Missing Tenders queue.** Renders with literal strings "present" / "missing". |
| `stage` | matcher.ts diff path | **High-signal.** Sorted to top (changes/route.ts:71–73). |
| `stage_source` | matcher.ts diff path | **Noise** — flips when the agency adds/removes a date even if stage is unchanged. |
| `method` | matcher.ts diff path | High-signal but rare. |
| `is_rollover`, `has_exception` | matcher.ts diff path | Flag toggles — useful but binary; renders as `true → false`. |
| `date_advertised` / `date_closed` / `date_eval_sent_*` / `date_of_award` | matcher.ts diff path | **Noisy under date-format drift.** Diff uses `String(a) === String(b)` (matcher.ts:137–142); freshness uses normalized comparison (`freshness.ts:97–109`). When Excel stores dates as serial numbers vs strings vs Date objects, the matcher diff can fire even when the freshness diff says "no change". |
| `contractor` | matcher.ts diff path | High-signal. Whitespace/case differences will flag a "change" even if it's the same vendor. |
| `implementation_start_date`, `implementation_end_date`, `implementation_status_pct` | matcher.ts diff path | High-signal but `implementation_status_pct` is integer-rounded (parser.ts:215) so should be stable. |
| `remarks` | matcher.ts diff path | **Highest noise volume.** Free-text remarks are edited every week. Any edit registers as a diff. |
| `programme_activity`, `line_item_code`, `programme_code`, `sub_programme_code` | matcher.ts diff path | Should be near-static. If they change, the row would more likely be a new scope (NEW + MISSING pair). When they DO show up here it's because the row matched fuzzily across a scope edit — quite rare. |
| `awarded_at` | ingest.ts:174 (NEW already at award), 370–377 (transition to award), review/[id]/route.ts:104–113 | **Always an ISO timestamp.** Useful as a marker but renders as `null → 2026-04-30T...` which is verbose. |
| `description` | matcher.ts diff path | Rare (description is part of fuzzy match), but possible after a `match` review-queue resolution. |

### 3.3 Duplicates of other surfaces

- `__created` rows duplicate the "New tenders" stat from the preview/apply summary.
- `__presence` rows duplicate the Missing Tenders queue.
- The `awarded_at` change always pairs with a `stage` change (matcher.ts diff for `stage='award'` + the extra insert at ingest.ts:370). The user sees both rows for the same event — meaningful but doubled.

### 3.4 Proposed grouping model

A change-type → human summary scheme that suppresses noise and de-duplicates the other queues:

```
Stage transitions (highest signal, always shown)
  • {tender description}
    Advertised → Evaluation
    (and: closed = 2026-04-15 was added)

Awards (always shown, expands)
  • {tender description}
    Awarded to {contractor} · awarded_at 2026-04-30
    [show 4 supporting field changes]

Date corrections (collapsed by default)
  • 12 tenders had date_advertised back-corrected
    [Expand: tender list with old → new dates]

Implementation progress (collapsed)
  • 8 tenders updated implementation_status_pct
    [Expand: list with delta]

Remarks edits (collapsed, low signal)
  • 23 tenders had remarks edited
    [Expand: side-by-side diffs]

(suppressed entirely)
  - __created rows — see "New tenders" panel on uploads page
  - __presence: present→missing rows — see Missing Tenders queue
  - stage_source-only changes (no accompanying stage change)
```

UI layer should:
1. Drop `__created` and outbound `__presence` rows from the changes feed (or render as explicit "see X" links to the dedicated queues).
2. Run dates through `normalizeDateLike` (freshness.ts:51–75) before treating a date diff as real. If `normalize(old) === normalize(new)`, the row is a representational artifact, not a change.
3. Group same-tender field changes into one card with ranked importance (stage > date_of_award > contractor > date_*  > remarks).
4. Collapse remarks edits behind an "Editorial changes" expand.

---

## 4. Missing Stage / Review Queue

### 4.1 Code paths that produce a review row

There are exactly **two** producers, both in `lib/psip/matcher.ts`:

1. **`ambiguous_stage`** — `matcher.ts:211–214`, triggered by `inc.needs_stage_review`. Set in parser at `parser.ts:175–184` (col J blank AND no dates). The empty `candidates` array (line 212 passes `[]`) tells the UI to show the "Missing stage" card variant.

2. **`ambiguous_match`** — three sub-paths:
   - `matcher.ts:264–268`: tied top scores ≥ 0.92, line_item_code provided but no candidate matches it.
   - `matcher.ts:268–270`: tied top scores ≥ 0.92, no line_item_code at all.
   - `matcher.ts:287–290`: top score in `[0.80, 0.92)`.

That's it. No other code path inserts into `tender_match_review` other than these two via `previewPsipUpload` (ingest.ts:75–98).

### 4.2 Rows that could have been auto-classified but weren't

The matcher only attempts identity within a scope key. Several signals available in-memory are **not** consulted before queuing for review:

1. **Cross-scope fuzzy match** — when `scoped.length === 0` (matcher.ts:219–223), the row is immediately classified NEW. There is no second-pass that broadens scope (e.g. drop programme_activity from the key) to find a tender that was renamed across sub-programmes. A tender that moved sub-programme will NEVER be matched. _Extension point: matcher.ts:219–223_.
2. **Description-only match across all PSIP tenders** — cheap fallback for unique enough descriptions (e.g. "Construction of Bartica Region 7 PVC Distribution Mains"). _Extension point: matcher.ts:222 (after the scope-empty check)_.
3. **Prior review-queue resolution** — when a `tender_match_review` row was resolved as `'created'` (review/[id]/route.ts:185), the next upload of an unchanged spreadsheet will see the same incoming row and re-queue it because no record links the parsed-row fingerprint back to the resulting tender. Effectively, **resolving by Create makes the row idempotent ONLY if the description normalizes identically and the scope key is identical**. Since `'created'` resolution can change `stage_source='manual_override'` (review/[id]/route.ts:126), the next upload's diff will then immediately overwrite it back to `'inferred_from_dates'` because the diff algorithm doesn't preserve manual-override.
4. **Title-against-trello tenders** — matcher.ts:186 hard-skips `e.source !== 'psip'`. PSIP rows that should fold into a Trello-managed HECI tender will never link.

### 4.3 Duplicate detection — the "four Bartica" symptom

There is **no upstream de-duplication of incoming rows**. I confirmed:

```
$ grep -n "dedup\|duplicate" /Users/alfonsodearmas/dg-work-os/lib/psip/*.ts
```

Returns only the programme-344 dedup pass at `parser.ts:444–460`, which dedupes a bare-`344`-header row against a later `344+sub` copy. It does **NOT** dedupe two same-description rows that both have a sub-programme.

Consequence for Bartica Region 7 PVC Distribution Mains: if the spreadsheet contains four separate rows (e.g. one parent + three children, or four children spread across the same sub-programme), each row produces an independent `ParsedTender`. They all share the same scope key; matcher.ts:225–241 looks for one exact normalized-description match and finds either zero or one. The other three either:
- become NEW (scoped is empty after first match — matcher.ts:219), or
- enter fuzzy and tie at 1.0 with the just-inserted exact match, get reviewed as ambiguous (matcher.ts:255–270).

But wait — the matcher works against `existing` (DB rows), not against rows already-processed in the same incoming batch. So all four incoming rows with the same description will EACH match the same single existing DB tender at score 1.0 (matcher.ts:227–240). All four get classified as `'update'` for the same `existing_tender_id`. The applyPsipUpload loop (ingest.ts:155–193) then runs `applyUpdate` four times for the same tender — last one wins; the first three are quasi-no-ops but each writes a stack of `tender_field_change` rows. **And all four `matchedIds.add(exact.id)` calls are idempotent**, so `missing` stays correct.

The "four rows in the review queue" symptom is then caused by something else. Most plausible:

- The four incoming rows have DIFFERENT `programme_activity` or `line_item_code` (so different scope keys), and there was no prior tender at any of those scopes → all four are NEW (matcher.ts:219–222). They populate the "New tenders" preview list — _not_ the review queue.
- OR the four rows have empty col J + no dates → `needs_stage_review=true` → all four go to review with `review_reason='ambiguous_stage'`. This is the most likely explanation given the symptom is in the Missing Stage tab. The parser does no in-batch dedupe on ambiguous-stage rows.
- OR the prior week's apply created a tender for the first row, but on this week's upload the row has slightly different programme_activity → NEW (different scope), and the previous tender becomes MISSING. Repeat for 4 weeks → 4 ambiguous-stage rows each week if the agency keeps editing the parent description.

**Bottom line:** there is no per-batch dedup at any layer. Two incoming rows with identical descriptions but no scope/stage signals will produce two review rows. _Extension points:_
- `parser.ts:439` (just before the 344-dedup loop) — add a description-fingerprint pass that drops or merges duplicates within the same scope.
- `matcher.ts:205` (top of the loop) — track `seen` keys across `incoming` to coalesce duplicates.
- `ingest.ts:75` — before inserting `tender_match_review` rows, deduplicate by `(description, agency, programme_code, sub_programme_code)`.

### 4.4 Skip — DB effect

`app/api/procurement/review/[id]/route.ts:191–195`:

```ts
await supabaseAdmin
  .from('tender_match_review')
  .update({ status: 'skipped', resolved_at: new Date().toISOString(), resolved_by: session.user.id })
  .eq('id', id);
```

Just flips status. **No tender row created, no MISSING flag flipped, no field change written, no audit reason captured.** Critically: when next week's upload arrives, the same incoming row will produce a fresh `tender_match_review` row (because the matcher has no memory of skip decisions). The review queue is not filterable by `status='skipped'`, but the same parsed row will re-appear unchanged. **Skip is effectively "snooze for one upload cycle, then re-surface" — there is no escape hatch beyond Create or Match.**

The `tender_match_review` GET (`app/api/procurement/review/route.ts:14–17`) only returns `status='pending'`, so skipped rows hide. They sit forever in the DB.

---

## 5. UX Gaps

### 5.1 Per-row reasoning ("why is this row here?")

**Mostly missing.**

- For `ambiguous_stage`: the UI says "Row came in with no stage column and no dates — assign a stage to ingest, or skip" (`app/procurement/review/page.tsx:101`). This is a generic banner, not per-row evidence. The user sees the description, agency, and programme_activity (page.tsx:110–113) but **not the row number from the spreadsheet** (which is captured at parser.ts:521 and lives in `incoming_row` JSON but is not rendered).
- For `ambiguous_match`: candidates are shown with a similarity score (page.tsx:176). Good. But the user is not told **why** the score is what it is — no token-level diff, no highlight of differing characters. The user can't see whether the candidate's description differs by case ("Black's Road" vs "Blacks Road") or by substance ("Phase I" vs "Phase III").
- The API response (`app/api/procurement/review/route.ts:35–45`) includes `incoming_row`, `candidate_tender_ids`, `scores`, `review_reason`. It does **not** include: prior upload's stage for the same scope, prior tender_match_review entries with the same description fingerprint, nor a "this row also appeared on N previous uploads" count. The data is technically reachable (raw_row+scope on prior `upload.id`s) but not joined.

### 5.2 Bulk actions

**None.**

- `app/procurement/review/page.tsx:55–72` `resolve` issues one POST per click. There is no "select all" checkbox, no "match all to candidate X", no "skip every row at this score band", no "create all with stage=design".
- `app/procurement/missing/page.tsx:27–40` is single-row only.
- `app/procurement/changes/page.tsx` has no actions at all.

This is painful when an agency renames 30 line items in one workbook revision — the user clicks 30 times.

### 5.3 Historical context per row

**Not surfaced.**

- The review API returns no `prior_upload_count`, no `previous_resolution`, no `last_seen_at` for the closest matching tender.
- The Missing Tenders API returns just the tender row (`Tender` type from `lib/tender/types.ts:78–116`). It does NOT include `last_seen_at`, days-since-last-seen, or which upload first flagged it as missing. The UI's "last seen" line (`app/procurement/missing/page.tsx:71`) reads `t.updated_at`, which is the tender row's last update — that's actually the moment it was flagged missing, not when the agency last reported it. Misleading.
- For "What Moved", changes/route.ts:35–43 fetches `tender_field_change` for ONE upload. It does not show rolling history; the page doesn't link to `/procurement/uploads/[id]` for prior uploads' diffs (it could — `app/api/procurement/uploads/[id]/route.ts:23–28` returns the field changes per upload).

The data exists. The query layer in `lib/tender/queries.ts:171–232` (`getTenderById`) does include `field_changes` and could be repurposed for the queue's per-row "history" panel, but the queue API does not call it.

---

## TOP 5 FIXES (impact-to-effort ranked)

1. **Suppress `__created` and `__presence` rows from "What Moved"** — Problem: the changes feed is dominated by sentinels that duplicate New Tenders and Missing Tenders panels. Fix: filter those `field_name` values out of `app/api/procurement/changes/route.ts:39` (or render them as a single summary card). Impact: HIGH. Effort: S.

2. **Dedup incoming rows before review-queue insert** — Problem: identical descriptions in the same upload produce N review-queue rows (the "four Bartica" pattern). Fix: in `lib/psip/ingest.ts:75–83`, group `reviewResults` by `(normalize(description), agency, programme_code, sub_programme_code)` and either insert one row per group or merge candidate sets. Impact: HIGH. Effort: S.

3. **Make Skip carry forward across uploads** — Problem: skipping a review row only hides it for one upload cycle; it re-appears next week with no record of the prior decision. Fix: persist a `parsed_row_fingerprint` (hash of agency+programme+description) on `tender_match_review` rows; at `lib/psip/ingest.ts:75` skip insertion if an existing row with status=`skipped` matches the fingerprint within an `is_active` window, OR add a "permanently skip" action that writes a `psip_excluded_fingerprint` row. Impact: HIGH. Effort: M.

4. **Show "why this row is here" evidence on review queue** — Problem: users can't tell whether a 0.87-score candidate is the same tender with a typo or genuinely different. Fix: extend `app/api/procurement/review/route.ts:36–45` to return per-candidate `description_diff` (token-level), `prior_resolution_count`, `last_seen_upload_at`; render in `app/procurement/review/page.tsx:166–187` as inline highlights. Pull `parsed_row.row_number` into the card so the user can grep the spreadsheet. Impact: MED-HIGH. Effort: M.

5. **Soft-archive instead of hard-delete in Missing Tenders** — Problem: Archive is irreversible and cascades all field-change history to oblivion (`app/api/procurement/missing/route.ts:58`). Fix: add `tender.archived_at TIMESTAMPTZ` and `tender.archived_by UUID`; change the action to `UPDATE` instead of `DELETE`, then exclude `archived_at IS NOT NULL` from `listTenders` (`lib/tender/queries.ts:144–169`). Audit history is preserved; archives can be reversed. Impact: MED. Effort: S-M.

---

### Caveats / things I could not confirm

- The exact source of "four Bartica Region 7 PVC Distribution Mains" duplicates is plausible but not load-bearing — I traced every code path that inserts into `tender_match_review` and there is no per-batch dedup at any layer (parser, matcher, ingest), so any duplication mechanism in the source spreadsheet propagates to the queue. The four-row symptom is consistent with §4.3 hypotheses but I did not have access to the actual workbook fixture to single-step it.
- I did not exhaustively read `lib/psip/__tests__/parser.test.ts` and `matcher.test.ts`; spot-checks above are from production code only. If a test asserts that duplicates ARE deduped, the production code does not back that assertion.
- Trello fold-in (migration 080) was not deeply read — I confirmed only that `matcher.ts:186` skips non-PSIP rows and `app/api/procurement/missing/route.ts` filters on `missing_from_last_upload` without checking source. A Trello-sourced row cannot end up in the Missing Tenders queue because the matcher never marks one missing (matcher.ts:298 filter on `e.source === 'psip'`).
