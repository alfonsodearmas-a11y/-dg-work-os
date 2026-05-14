# Claude Code Plan — Action Items Extraction System

**Project:** AI-powered action item extraction from Fireflies meeting transcripts, routed into DG Work OS.
**Owner:** Alfonso De Armas, DG MPUA
**Target build time:** 1–2 days build, 4 meetings of in-production eval, then auto-create turned on.
**Stack:** Next.js App Router, Supabase/Postgres, Prisma, Tailwind, Claude API (Opus 4.7), Fireflies GraphQL API.

---

## 0 — The One Decision That Anchors Everything

**Attribution:** Every AI-generated action item is attributed to the meeting itself, not to the AI and not to the DG personally.

Item author field reads: *"Generated from [Meeting Name], [Date]. Reviewed by DG Office."* If unreviewed (auto-created high-confidence items after Phase 2), it reads *"Generated from [Meeting Name], [Date]. Not yet reviewed."*

This is non-negotiable and affects the schema, the UI, and every future conversation about the system. Write this at the top of every relevant file as a comment.

---

## 1 — What We're Building

A pipeline that:
1. Detects new Fireflies transcripts (poll every 10 min via GraphQL — webhook status TBD by Alfonso checking settings).
2. Calls Claude API to extract action items as structured JSON.
3. Resolves owner names against MPUA staff directory.
4. Validates each item against the writing standard (banned verbs, canonical sentence structure, required fields).
5. Routes items to a confirmation queue.
6. After review, creates records in the Action Items module (new) or links to existing War Room / Procurement records.

**Ship-first constraint:** Review-only mode for the first 4 meetings. No auto-create. The DG sees every extracted item before it enters any other module.

---

## 2 — Tech Decisions (Locked In, Don't Revisit)

- **Model:** `claude-opus-4-7` for extraction. Don't use Sonnet or Haiku — commitment detection is the highest-stakes task in the pipeline.
- **Ingestion:** Fireflies GraphQL API, polling every 10 minutes. Webhook upgrade later if Alfonso confirms webhooks are available on his plan.
- **Storage:** Same Supabase instance as DG Work OS. Two new tables: `action_items`, `action_item_extractions`.
- **Auth:** Existing DG Work OS Google Workspace OAuth. Only DG and PS can see the confirmation queue initially.
- **UI:** New route `/action-items` in the existing Next.js app. Confirmation queue at `/action-items/review`.
- **SQL migrations:** Output to `.sql` files for manual execution via Supabase Dashboard. Do not auto-run. This is an existing rule in DG Work OS; it applies here too.

---

## 3 — Data Model

### 3.1 `action_items` table

```sql
CREATE TABLE action_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority            TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3')),
  agency              TEXT NOT NULL,
  owner_id            UUID REFERENCES people(id),
  owner_name_raw      TEXT NOT NULL,
  co_owner_ids        UUID[] DEFAULT '{}',
  verb_category       TEXT NOT NULL CHECK (verb_category IN (
                        'correspondence','decision','information',
                        'scheduling','project_update','analysis')),
  task                TEXT NOT NULL CHECK (char_length(task) <= 500),
  due_at              TIMESTAMPTZ,
  due_trigger         TEXT,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                        'open','in_progress','complete','cancelled','disputed')),
  source_meeting_id   TEXT NOT NULL,
  source_timestamp    TEXT,
  source_quote        TEXT,
  linked_module       TEXT,
  linked_record_id    UUID,
  extraction_id       UUID REFERENCES action_item_extractions(id),
  attribution         TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by         UUID REFERENCES people(id),
  reviewed_at         TIMESTAMPTZ
);

CREATE INDEX idx_action_items_owner ON action_items(owner_id);
CREATE INDEX idx_action_items_agency ON action_items(agency);
CREATE INDEX idx_action_items_status ON action_items(status);
CREATE INDEX idx_action_items_due ON action_items(due_at);
```

### 3.2 `action_item_extractions` table

```sql
CREATE TABLE action_item_extractions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id            TEXT NOT NULL UNIQUE,
  meeting_title         TEXT,
  meeting_date          TIMESTAMPTZ,
  transcript_url        TEXT,
  prompt_version        TEXT NOT NULL,
  model                 TEXT NOT NULL,
  raw_response          JSONB NOT NULL,
  token_count_input     INTEGER,
  token_count_output    INTEGER,
  extraction_duration_ms INTEGER,
  items_extracted       INTEGER NOT NULL DEFAULT 0,
  items_accepted        INTEGER NOT NULL DEFAULT 0,
  items_edited          INTEGER NOT NULL DEFAULT 0,
  items_rejected        INTEGER NOT NULL DEFAULT 0,
  items_missed          INTEGER,
  review_status         TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN (
                          'pending','in_review','complete')),
  reviewed_by           UUID REFERENCES people(id),
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.3 Extending `people` (if aliases don't exist yet)

```sql
ALTER TABLE people ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';

COMMENT ON COLUMN people.aliases IS 'Alternative names/spellings heard in transcripts. E.g., "Kesh" for "Kesh Nandlall", "Mark" for specific Mark at GWI.';
```

---

## 4 — The Writing Standard (Enforced at Validation)

### 4.1 Canonical sentence structure

```
[Owner], [Agency], to [verb] [object] [qualifier], by [due date].
```

### 4.2 Approved verb taxonomy (by category)

- **correspondence:** write, issue, send, draft, publish, distribute
- **decision:** approve, sign, authorize, clear, reject
- **information:** obtain, verify, confirm, report, investigate
- **scheduling:** schedule, convene, arrange, coordinate
- **project_update:** update, submit, mark, close, reopen
- **analysis:** calculate, analyze, assess, compare, evaluate

### 4.3 Banned verbs/phrases (fail validation)

- "follow up on", "follow up with"
- "touch base"
- "circle back"
- "look into"
- "handle"
- "address the issue of"
- "work on" (with no specific deliverable)

Validation: case-insensitive substring match on the task text. If any banned phrase is present, the item fails validation and is flagged in the confirmation queue with an editable field and a hint.

### 4.4 Due date resolution rules

| Phrase | Resolved to |
|--------|-------------|
| "today" / "EOD today" / "by end of day" | Meeting date, 18:00 local (America/Guyana) |
| "tomorrow" / "by morning" | Meeting date + 1 day, 09:00 local |
| "this week" | Friday of meeting week, 17:00 local |
| "next week" | Friday of following week, 17:00 local |
| "ASAP" | Meeting date + 3 business days, flagged for confirmation |
| "when ready" / "in due course" / "open" | Null, requires named trigger in `due_trigger` |
| No temporal language | Null with confidence 0.5, forced to confirmation queue |

### 4.5 Priority assignment rules (NOT extracted from transcript)

- **P0** if deadline is within 24 hours AND (topic touches safety OR speaker is Minister/President).
- **P1** if deadline within 5 business days AND (speaker is Minister or PS, OR task blocks another tracked project).
- **P2** default for items with a deadline 1–4 weeks out.
- **P3** for items with no deadline and no external dependency.

Assign priority programmatically after extraction, not via the AI.

---

## 5 — The Extraction Prompt (v0.1)

Store this in `/lib/action-items/prompts/extraction-v0.1.ts` as a string constant. Version the filename when editing.

```
You extract action items from government management meeting transcripts for
the Ministry of Public Utilities and Aviation (MPUA), Guyana.

A COMMITMENT is a statement where a named person takes responsibility for a
specific future action. Commitments include:
- Direct commitments: "I will send X by Friday"
- Third-party assignments: "[Name] to issue the letter today"
- Agreement responses: "yes, I'll do that" / "okay" / "noted" in response
  to a directive
- Minister or PS instructions that receive acknowledgment from the assignee

NON-COMMITMENTS (do not extract):
- Hypotheticals: "we should look at this"
- Observations: "this is a problem"
- Past actions already completed
- Generic aspirations without a named owner
- Cancelled actions (if later in the transcript someone says "actually let's
  not do that")

For every commitment, produce a JSON object matching the schema below.

RULES:

1. OWNER: Use the name as spoken. If only a first name is used, record it in
   name_raw. Do not attempt to resolve to full names.

2. TASK: Rewrite the commitment as a canonical sentence. Use only verbs from
   this approved list:
   correspondence: write, issue, send, draft, publish, distribute
   decision:       approve, sign, authorize, clear, reject
   information:    obtain, verify, confirm, report, investigate
   scheduling:     schedule, convene, arrange, coordinate
   project_update: update, submit, mark, close, reopen
   analysis:       calculate, analyze, assess, compare, evaluate

   NEVER use these phrases: "follow up on", "touch base", "circle back",
   "look into", "handle", "address the issue of", "work on".

   Maximum 500 characters. Be specific. Include the object of the action.

3. DUE: Record the raw phrase in due_raw. Attempt resolution per these rules:
   "today"/"EOD" → meeting_date at 18:00
   "tomorrow"/"by morning" → meeting_date + 1 day at 09:00
   "this week" → Friday of meeting week at 17:00
   "next week" → Friday of following week at 17:00
   "ASAP" → meeting_date + 3 business days (flag for confirmation)
   no temporal language → null

4. SOURCE: Include the timestamp (HH:MM:SS) and a verbatim quote (max 500
   chars) from the transcript. The quote must appear word-for-word in the
   transcript. Do not paraphrase.

5. CONFIDENCE: Score each field 0.0 to 1.0. Set overall confidence to the
   minimum of all field scores. Be calibrated: if a field is inferred rather
   than directly stated, lower its confidence.

6. CONFIDENCE REASONS: Always explain low-confidence scores in plain text.
   Example: "owner 'Mark' is ambiguous; no full name given"

7. VERB CATEGORY: Assign the primary action's category from the taxonomy.

8. CO-OWNERS: If a commitment explicitly names multiple people as jointly
   responsible, list all in co_owners. Do not split into multiple items.

9. DO NOT infer priority. Do not attempt record linking. Both are handled
   downstream.

10. Include DG Alfonso De Armas's own commitments in the output. Do not
    skip them because he is the one running the system.

11. If the transcript contains a cancellation ("actually, forget that")
    for a previously-stated commitment, do not extract the cancelled item.

OUTPUT: Valid JSON only. No preamble, no markdown fences. Schema:

{
  "meeting_date": "YYYY-MM-DD",
  "meeting_title": "string",
  "items": [
    {
      "owner": { "name_raw": "string", "confidence": 0.0 },
      "co_owners": [{ "name_raw": "string" }],
      "agency_guess": "GPL | GWI | GCAA | CJIA | MARAD | HCI | HA | MPUA-DG | MPUA-Minister | MPUA-PS | MPUA-Comms | MPUA-CityCouncil | unknown",
      "verb_category": "correspondence | decision | information | scheduling | project_update | analysis",
      "task": "string (canonical sentence, max 500 chars)",
      "due": {
        "raw": "string",
        "resolved": "YYYY-MM-DDTHH:MM or null",
        "confidence": 0.0
      },
      "source": {
        "timestamp": "HH:MM:SS",
        "quote": "string (verbatim, max 500 chars)"
      },
      "confidence_overall": 0.0,
      "confidence_reasons": ["string"]
    }
  ]
}
```

---

## 6 — File/Folder Structure

```
/app
  /action-items
    page.tsx                       # list view
    /review
      page.tsx                     # confirmation queue
      [extractionId]
        page.tsx                   # review a specific extraction
  /api
    /action-items
      /poll-fireflies
        route.ts                   # cron job endpoint
      /extract
        route.ts                   # trigger extraction manually
      /[id]
        route.ts                   # GET/PATCH single item
      /review
        /[extractionId]
          route.ts                 # submit review decisions

/lib
  /action-items
    /prompts
      extraction-v0.1.ts           # frozen prompt string
    /fireflies
      client.ts                    # GraphQL client
      types.ts                     # Fireflies response types
      poll.ts                      # fetch new transcripts since last poll
    /extraction
      extract.ts                   # calls Claude API with transcript
      types.ts                     # extraction response types
    /resolution
      owner.ts                     # match name_raw → person
      due.ts                       # resolve due date strings
      priority.ts                  # assign priority by rule
    /validation
      banned-phrases.ts            # blacklist check
      canonical-form.ts            # sentence structure check
      required-fields.ts           # null checks
      index.ts                     # runs all validators, returns errors
    /routing
      destination.ts               # which module does this item belong in

/components
  /action-items
    ItemCard.tsx                   # display card, canonical format
    ReviewPanel.tsx                # confirmation queue row
    TranscriptSnippet.tsx          # left-pane transcript context
    EditForm.tsx                   # editable fields
```

---

## 7 — Build Order (Do These In Sequence)

### Day 1

**1. Migrations first.** Write the SQL for `action_items`, `action_item_extractions`, and the `people.aliases` column. Output as `/supabase/migrations/action_items_v1.sql`. Do not run automatically — output the file and prompt user to execute via Supabase Dashboard.

**2. Seed the staff directory with aliases.** Update `people` rows for the known attendees of management meetings:
- Kesh Nandlall: aliases `['Kesh', 'Kish', 'Cash', 'Keche']`
- Christopher Vandeyar: aliases `['Chris', 'Christopher']`
- Horace Williams: aliases `['Horace', 'Horus', 'Horris']`
- Deodat Indar: aliases `['Minister', 'DJ', 'DJ Fields']`
- Vishal Ambedkar: aliases `['PS', 'Vishal']`
- Ramesh Ghir: aliases `['Ramesh', 'Romesh', 'Ramsh']`
- Thandi McAllister: aliases `['Thandi', 'Tandai']`
- Ryan Ross: aliases `['Ryan', 'Brian']`
- Amir Dillawar: aliases `['Amir', 'Air']`
- Bharat Harjohn: aliases `['Bharat', 'John', 'Barat']`
- Alfonso De Armas: aliases `['Alfonso', 'Alonso']`

Output as a second SQL file: `/supabase/migrations/seed_aliases.sql`. Same manual-execution rule.

**3. Fireflies GraphQL client.** Thin wrapper around fetch. Two functions:
- `listTranscripts(since: Date)` → array of meeting metadata.
- `getTranscript(meetingId)` → full sentence-level transcript with speakers.

Test both functions against the last 5 meetings in Alfonso's Fireflies account.

**4. Extraction function.** `extractActionItems(transcript: FirefliesTranscript)` → JSON matching the schema. Uses Anthropic SDK, model `claude-opus-4-7`, prompt v0.1. Returns the parsed JSON.

**5. Validation pipeline.** Given an extraction result, run:
- Banned-phrase check on `task`.
- Verb taxonomy check (verb in approved list).
- Required-field check.
- Returns `{ valid: boolean, errors: string[], item: ExtractedItem }`.

**6. Resolution pipeline.** For each extracted item:
- Owner resolution against `people.aliases` and `people.name`.
- Due-date resolution per rules.
- Priority assignment per rules.
- Returns the item enriched with `owner_id`, `due_at`, `priority`.

**7. Wire end-to-end against the 13 April transcript.** Feed the real transcript in, get extracted items out, log to console. Stop and inspect. This is the first reality check. If owner resolution is < 80% accurate or commitment recall is < 85%, stop and tune the prompt before building UI.

### Day 2

**8. Confirmation queue UI.** Route at `/action-items/review/[extractionId]`. Layout: transcript snippet left (with timestamp jump), proposed item right. Editable fields only for those with confidence < 0.85. Keyboard shortcuts: `A` accept, `E` edit, `R` reject, `J/K` next/previous, `Enter` save.

**9. Submission endpoint.** `POST /api/action-items/review/[extractionId]` accepts an array of `{ item_id, decision, edited_fields }`. On accept/edit, creates a row in `action_items`. On reject, does nothing but logs the rejection for eval.

**10. Action Items list view.** Route at `/action-items`. Shows all items filterable by agency, owner, status, priority. Canonical card format per the spec.

**11. Manual trigger button.** At `/action-items`, button "Process a new meeting." Prompts for Fireflies meeting ID. Runs the pipeline, sends user to review queue. Use this for the 13 April transcript first.

**12. Polling cron.** Vercel Cron or Supabase pg_cron, every 10 minutes. Calls `listTranscripts` with `since = max(meeting_date) from action_item_extractions`. For each new transcript, runs the pipeline and inserts an extraction row with `review_status = 'pending'`. Notifies DG via whatever notification channel DG Work OS already uses (Slack/email/in-app).

### Day 3 (if needed)

**13. Fix the sharp edges.** Whatever broke during Day 2 testing.

---

## 8 — The Phase 0 Eval, But In Production

The Phase 0 eval from the rubric runs naturally during the first 4 meetings. No sandbox.

For each of the first 4 meetings after launch:
- Process in review-only mode.
- DG reviews every item in the confirmation queue.
- System logs per-field edits, rejects, and manual additions (items DG added that the AI missed).
- After 4 meetings, compute: commitment recall, precision, owner accuracy, task quality, due accuracy.

**Turn on auto-create when:**
- Commitment recall ≥ 90%
- Commitment precision ≥ 85%
- Owner accuracy ≥ 85%
- Overconfidence rate (high-confidence wrong answers) ≤ 5%

If not hit after 4 meetings, tune prompt to v0.2 and run 4 more meetings.

---

## 9 — What's Explicitly NOT in v1

Do not build any of these in the first build. Each is easy to add later and hard to maintain if added prematurely.

- Record matching against War Room / Procurement / Projects Oversight. Items route to Action Items module only. DG links manually for the first month.
- Commitment ledger / compliance scoring. Adds political risk without operational value until the extractor is trusted.
- Notifications to anyone except DG. No pushing items to Vandeyar or Kesh until review flow is proven.
- Mobile UI. Desktop-only.
- Multi-meeting search across transcripts. Gemini and Fireflies already do this.
- Sentiment analysis, talk-time ratios, or any other "conversation intelligence" theater.
- Webhook endpoint. Polling every 10 minutes is sufficient for weekly management calls. Add webhooks if Fireflies plan confirms availability and if meeting cadence increases.

---

## 10 — Risks To Watch During Build

- **Fireflies speaker labels on Caribbean English.** Untrained, it may return "Speaker 1" instead of real names. Voice training takes 3–5 meetings to stabilize. If Day 1 test shows "Speaker 1" output, Fireflies needs voice samples uploaded before the extractor is reliable.
- **Owner resolution failure modes.** "Mark" alone is ambiguous. The resolver must surface ambiguity in the confirmation queue, not silently pick one.
- **Model hallucination on quotes.** The extractor may paraphrase instead of quoting verbatim. Validation step must compare quote against transcript. If quote doesn't appear in transcript as a substring (after normalization of whitespace and punctuation), reject the item as a hard validation failure.
- **Cancelled actions extracted anyway.** The 13 April transcript has at least one ("let me run that back through"). Prompt instructs to skip, but test this specifically.
- **Token cost creep.** A 2.5-hour transcript is ~50k tokens input. At Opus rates, each extraction is meaningful spend. Not prohibitive for weekly meetings but worth tracking in the `token_count_input` field.

---

## 11 — First Commit Checklist

Before pushing the first commit to the DG Work OS repo:
- [ ] Attribution decision written as a comment at top of schema file
- [ ] Prompt version frozen at v0.1 in a named file
- [ ] Both SQL migrations generated but not executed
- [ ] Fireflies API key in `.env.local`, not committed
- [ ] Read-only test against 13 April transcript passes: ≥30 of 43 items extracted, owner accuracy ≥80%
- [ ] Confirmation queue UI loads and displays at least one extracted item
- [ ] DG can accept, edit, and reject items; decisions persist to database

---

## 12 — Paste This Into Claude Code

When you start Claude Code tomorrow, paste the entire contents of this file plus the three reference markdown files (`action_items_2026-04-13.md`, `action_item_standard_spec.md`, `phase_0_eval_rubric.md`) into the initial context. Then say:

> "Read these files. Explore the DG Work OS codebase, specifically looking at how existing modules like War Room and Procurement are structured. Then give me a plan for the build that matches the structure of section 7 in the Claude Code Plan, adapted to fit what you find in the codebase. Do not write any code yet."

Approve the plan, then build step by step using your standard explore-plan-approve-implement pattern. Run `/simplify` before committing each logical chunk.
