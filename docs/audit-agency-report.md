# Agency Report — Information & Design Audit

_What a DG Work OS "agency report" actually contains, where each field comes from, and how it is laid out — for both the on-screen Bento at `/intel/[agency]` and the emailable PDF produced by `POST /api/intel/[agency]/report`._

Snapshot date: 2026-05-28. Source-of-truth files cited inline.

---

## 1. The two faces of an "agency report"

| Surface | Route | Renderer | Purpose |
|---|---|---|---|
| **On-screen Bento** | `/intel/[agency]` | `components/intel/bento/AgencyBento.tsx` | Operational dashboard, live |
| **Emailed PDF — "The Intel Brief"** (default) | `POST /api/intel/[agency]/report` | `lib/pdf/intel-brief-render.tsx` | Editorial weekly brief addressed to the DG |
| **Emailed PDF — Legacy** (escape hatch) | same route with `?template=legacy` | `lib/pdf/agency-intel-report.tsx` | Older dashboard-style PDF, kept as fallback |

Both surfaces are fed by the **same data function** — `getAgencyIntelData(agency)` in `lib/intel/get-agency-intel-data.ts` — so they cannot drift.

The two surfaces show **different subsets** of that data, by design:

- The Bento exposes everything (grid reliability, outages, station heatmap, airstrips, applications).
- The Intel Brief PDF deliberately narrows to three chapters (Tasks, Projects, Procurement) for editorial focus — it is a written brief, not a dashboard.

---

## 2. Agencies the report covers

Defined in `lib/agencies.ts`:

| Code | Display name | Accent (hex) | Icon |
|---|---|---|---|
| GPL | Guyana Power & Light | `#f59e0b` amber | Zap |
| GWI | Guyana Water Inc. | `#06b6d4` cyan | Droplets |
| CJIA | CJIA Airport — Operations | `#0ea5e9` sky | Plane |
| GCAA | Civil Aviation Authority | `#8b5cf6` violet | Shield |
| HECI | Hinterland Electrification Company Inc. | `#f59e0b` amber | Lightbulb |
| MARAD | Maritime Administration Department | `#2563eb` blue | Anchor |
| HAS | Hinterland Airstrips Service | `#f97316` orange | PlaneLanding |

Access is gated by `canAccessAgency(role, userAgency, target)`. Agency users only ever see their own agency.

---

## 3. Shared data the report carries (every agency)

These three blocks appear for **every agency** on both surfaces. Source: `getAgencyIntelData()`.

### 3.1 Open Tasks
- **Source:** Supabase `tasks` table, filtered by `agency` and `OPEN_STATUSES`.
- **Fields per task:** `id`, `title`, `status` (new/active/blocked), `priority` (low/medium/high/critical), `due_date`, `owner_name`, `is_overdue` (derived from due_date < today).
- **Aggregates:** total count, overdue count, priority-dot breakdown.
- **Sort:** overdue first, then by due_date ascending.

### 3.2 Delayed Projects
- **Source:** `delayed_projects` view, agency-filtered, restricted to **HIGH** and **MEDIUM** risk tiers (LOW excluded).
- **Fields per project:** `id`, `project_name`, `contractors`, `contract_value` (GYD), `completion_percent`, `end_date`, `days_overdue`, `risk_tier`.
- **Sort:** `days_overdue` descending (worst slip first).

### 3.3 Procurement Attention
Two sub-lists, deduplicated against each other.

- **Critical tenders** — `tender` rows with `reason ∈ {missing_pending_decision, missing_from_upload, stale_award}`.
- **Evaluation tenders** — `tender` rows with `stage = 'evaluation'`, **minus** anything already in Critical.
- **Fields per tender:** `id`, `description`, `stage`, `days_in_stage`, `reason`, `next_action_owner`, `sub_programme_name`.
- **Placeholder owners** matching `/placeholder|TBD|unassigned|^—$/i` are flagged "unassigned" in the PDF (`lib/pdf/intel-brief-render.tsx:189–196`).

### 3.4 Agency head / focal point (PDF footer + page metadata)
- **Source:** `agency_psip_focal_point` table.
- **Fields:** agency head name & email, PSIP focal-point name & email.
- Strings containing `"(placeholder)"` are stripped before display so seed data does not leak to the DG.

---

## 4. Agency-specific data — Bento only

The PDF Brief does **not** carry these; they live only on `/intel/[agency]`.

### 4.1 GPL — six extra cards
| Card | Fields | Source |
|---|---|---|
| **Grid Reliability** | SAIDI (min/customer), SAIFI (events/customer), outages MTD, customer-hours lost, Δ% vs prior month, comparator label, feeder count, total customers, last sync | `gpl_feeder_cache` + `gpl_outage_cache` (MTD vs prior month, SAIDI/SAIFI computed in JS) |
| **Outages (recent)** | total MTD, open count, 6 recent: feeder code, areas affected, date/time, duration (min), customer impact | `gpl_outage_cache` (50 row cap) |
| **Application Efficiency** | pipeline funnel (Survey → Estimation → Designs → Approval → Metering → Execution → Other), avg days per stage, closed 30d, submitted 30d, avg days to close, backlog now, backlog Δ 30d, approval rate % | `customer_applications` + `pending_applications_with_wait` view |
| **Station Availability heatmap** | per-station code + % available, colour-coded healthy/degraded/critical/unknown | `gpl_daily_stations` (latest per station) |
| **Pending Applications** | total pending, over-30d, avg/max wait days, oldest age, age buckets (0–30, 31–60, 61–90, 90+), data as-of | `pending_applications_with_wait` |
| **Outage aggregates** | 30-day daily series, top 5 feeders by impact | `gpl_outage_cache` |

### 4.2 GWI
- **Pending Applications** card only — total, over-30d, avg/max wait, data as-of.
- Same `pending_applications_with_wait` view as GPL.

### 4.3 HAS
- **Airstrip Operations** card (full-width, replaces rows 2–4): total airstrips, operational/limited/under-rehab/closed counts, overdue-inspection count, pending-verification count, preview list (name, region, surface, status, days since inspection).
- Sources: `airstrips` + `airstrip_maintenance_log`.

### 4.4 CJIA, GCAA, HECI, MARAD
- No agency-specific cards yet. Only the three shared blocks (§3) render.

---

## 5. On-screen Bento — layout

File: `components/intel/bento/AgencyBento.tsx`. Grid is 12-column, responsive (1 col mobile / 2 cols tablet / 12 cols desktop).

```
┌─────────────────────────────────────────────────────────────────┐
│ AgencyHero — icon, name, dynamic subtitle, meta strip,          │
│              "Generate Report" button                            │
└─────────────────────────────────────────────────────────────────┘

Row 1 (all agencies) — three cards × 4 cols:
┌──────────────┬──────────────┬──────────────┐
│ Open Tasks   │ Delayed Proj │ Procurement  │
└──────────────┴──────────────┴──────────────┘

GPL only — rows 2–4:
┌──────────────────────┬──────────┐
│ Grid Reliability     │ Outages  │   (8 cols / 4 cols, row-span 2)
│                      │          │
└──────────────────────┴──────────┘
┌──────────────────────┬──────────────────────┐
│ App Efficiency       │ Station Availability │  (6 / 6)
└──────────────────────┴──────────────────────┘

HAS only — replaces rows 2–4:
┌─────────────────────────────────────────────┐
│ Airstrip Operations (full 12 cols)          │
└─────────────────────────────────────────────┘

GWI — adds a Pending Applications card to row 2.

Other agencies — no further rows.
```

**Visual system** (`components/intel/common/`):
- Card chrome: navy-950 bg, navy-800 border, gold-500 hover, top accent stripe in the agency's accent hex.
- Primitives: `BentoCard`, `CardHead`, `DeltaTile`, `StatusBadge`, `TrendIndicator`, `ProgressBar`, `Sparkline`, `LoadingSkeleton`, `AlertCard`.
- Tones: `good` emerald-400 / `warn` amber-400 / `bad` red-400 / `calm` navy-600.
- Ambient radial-gradient glow behind the grid, mixed with the agency accent.

**Caching:** `GET /api/intel/[agency]` is cached 60s server-side with stale-while-revalidate 120s.

---

## 6. The PDF — "The Intel Brief"

File: `lib/pdf/intel-brief-render.tsx`. Rendered with `@react-pdf/renderer` on a Node.js runtime (Edge is incompatible). Page size: **A4**.

### 6.1 Structural sections

```
┌─────────────────────────────────────────────┐
│ 1. Wordmark    DG WORK OS                   │
│                OFFICE OF THE DIRECTOR GENERAL│
│                · MINISTRY OF PUBLIC UTILITIES│
│                  & AVIATION                  │
│                                              │
│ 2. Vol/Issue   Vol. 3 · No. 22 · 28 May 2026 │
│                                              │
│ 3. Eyebrow     — The Intel Brief —           │
│                                              │
│ 4. Masthead    Guyana Power & Light.         │
│                                              │
│ 5. Lede        Open work, delayed projects,  │
│                and procurement attention,    │
│                surfaced from DG Work OS for  │
│                {Director General's name}.    │
│                                              │
│ 6. Stats strip  12       4         3         │
│                 open     delayed   procure-  │
│                 tasks    projects  ments     │
│                                    stalled   │
│                                              │
│ 7. Chapter i — Open work.                    │
│    "12 tasks open. 4 past due."              │
│    [article rows…]                           │
│                                              │
│ 8. Chapter ii — Projects in slip.            │
│    [page-break before]                       │
│    "4 projects behind schedule. 287 days     │
│     of cumulative slip."                     │
│    [article rows…]                           │
│                                              │
│ 9. Chapter iii — Procurement attention.      │
│    [page-break before]                       │
│    "3 procurements stalled. 1 without a      │
│     named next-action owner."                │
│    [article rows…]                           │
│    Also in evaluation.                       │
│    12d · {tender description} · {sub-prog}   │
│                                              │
│ 10. Footer (fixed, every page)               │
│     The Intel Brief · GPL · {sender} · {date}│
└─────────────────────────────────────────────┘
```

### 6.2 Volume / issue derivation

File: `lib/pdf/intel-brief-issue.ts`. Stateless — no counter table.

- **Vol** = `current year − 2024 + 1` (launch year fixed at 2024 for editorial weight).
- **No** = ISO 8601 week (Thursday-anchored, matches `EXTRACT(WEEK FROM …)` in Postgres).
- **Date** = `"DD Month YYYY"` zero-padded day, full month, four-digit year. No comma.
- **Line format:** `Vol. {N} · No. {W} · {date}` with U+00B7 middle dots.

### 6.3 The DG-as-recipient rule

The Brief is addressed to the Director General by definition, regardless of who clicked "Generate Report".

`resolveDGRecipientName()` queries `users WHERE role='dg' AND is_active=true ORDER BY created_at ASC LIMIT 1`. Falls back to the sender's name if no active DG row exists. (`app/api/intel/[agency]/report/route.ts:262–276`)

### 6.4 Chapters — content rules

#### Chapter i — Open work
- Sort: overdue first, then by `due_date` ascending.
- **Cap: 30 tasks rendered.**
- Per row: title; meta line `STATUS · due {date}[. overdue.]` or `STATUS · no due date`. Overdue meta painted orange (`#fb923c`).
- Lede sentence is dynamic: empty / `"N tasks open. M past due."` / `"N tasks open. None overdue."`

#### Chapter ii — Projects in slip
- Sort: `days_overdue` descending.
- **Cap: 25 projects.**
- Per row: top-stat row in gold `{completion}% complete   {days} days overdue`, then title, then `Contractor · GYD {value}` (omits the GYD piece if value is null/0/non-finite).
- Lede: `"N projects behind schedule. M days of cumulative slip."`

#### Chapter iii — Procurement attention
- **Cap: 25 critical tenders + 12 evaluation coda items.**
- Per row: gold top-stat `{days} days in stage   {STAGE_LABEL}`; title; meta line `{REASON_LABEL} · next: {owner | unassigned}`.
- Reason labels: `missing_pending_decision → "Missing. Pending decision."`, `missing_from_upload → "Missing from latest upload."`, `stale_award → "Stale award."`.
- Stage labels: design / advertised / evaluation / awaiting_award / award (Title Case).
- **Unassigned owners are flagged in orange italic** when the value matches `/placeholder|TBD|unassigned|^—$/i`.
- Lede counts the unnamed-owner subset: `"N stalled. M without a named next-action owner."`.
- **"Also in evaluation." coda** lists the remaining 12 with a gold day-count badge.

#### Quiet-week fallback
When all three chapters are empty, the body simply reads:

> _Nothing demands the Director General's attention this week._

The stats-strip numerals fade to the muted colour in this case.

### 6.5 Page-break rules
- The first non-empty chapter does **not** force a page break (it follows the stats strip).
- Every subsequent chapter starts on a new page (`<Chapter break={!isFirst}>`).
- Each `articleRow` and the masthead are `wrap={false}` (won't split across pages).

### 6.6 Design tokens

File: `lib/pdf/intel-brief-tokens.ts`. The canonical palette and typography — do not duplicate elsewhere.

**Palette**

| Token | Hex | Use |
|---|---|---|
| `INK` | `#f1ecdd` | Cream — body, headlines |
| `BG` | `#1a2740` | Page background (dark navy) |
| `BG_DEEP` | `#14202f` | Fill behind seals/badges |
| `MUTED` | `#8b9bb7` | Secondary metadata, captions |
| `MUTED_2` | `#5e6e8b` | Tertiary, footer |
| `GOLD` | `#e5b73d` | Oversized numerals, eyebrows |
| `ORANGE` | `#fb923c` | Overdue / severity only |
| `RULE` | `rgba(241,236,221,0.15)` | Hairline dividers (0.5pt) |

**Typography** — single family, **Inter** (Light/Regular/Italic/Bold), TTFs bundled in `public/fonts/`. Hyphenation disabled.

| Role | Size | Weight | Style | Notes |
|---|---|---|---|---|
| Masthead (agency name) | 72pt | 300 | — | `letter-spacing: -2.52`, `line-height: 1.0` |
| Chapter heading | 36pt | 400 | _italic_ | `letter-spacing: -0.72` |
| Oversized numeral | 84pt | 300 | — | `letter-spacing: -4.2`, gold, tabular numerals |
| Volume/Issue line | 11pt | 400 | uppercase | tracking 0.66 |
| Eyebrow / Chapter marker | 11pt | 400 | uppercase | tracking 2.42, gold |
| Lede | 14pt | 400 | _italic_ | `line-height: 1.5` |
| Body | 13pt | 400 | — | line-height 1.5 |
| Article title | 13pt | 400 | — | line-height 1.4 |
| Meta | 11pt | 400 | — | muted |
| Meta (overdue) | 11pt | 400 | — | orange |
| Meta (unassigned) | 11pt | 400 | _italic_ | orange |
| Footer | 10pt | 400 | — | muted-2, tracking 0.4 |
| Coda header | 14pt | 400 | _italic_ | muted |
| Coda item | 11pt | 400 | — | muted |
| Top-stat number | 22pt | 300 | — | gold, tabular, tracking -0.6 |

**Layout / rhythm**

- Page padding: 56pt horizontal, 56pt top, 64pt bottom.
- Masthead → stats strip: 48pt.
- Stats strip → first chapter: 64pt.
- Chapter heading → lede: 12pt.
- Chapter → first article: 24pt.
- Article vertical padding: 14pt.
- Separator: 0.5pt hairline (`RULE`).
- Article rows are flex-row with the body in `flex: 1` (no second column today; the layout reserves room for a future seal/initials column — see the unused `ownerInitials` and `SEAL` tokens).

### 6.7 Hard caps & what falls off the edge

| Section | Cap | Behaviour at overflow |
|---|---|---|
| Open tasks | 30 | Silent — extras simply do not render |
| Delayed projects | 25 | Silent |
| Critical procurement | 25 | Silent |
| Evaluation coda | 12 | Silent |
| Article rows | wrap={false} | Force-bounce to next page if it would split |
| Pages | A4, no max | Brief grows; footer fixed on each page |

There is no "see more" pointer or count of un-rendered items in the PDF today — worth flagging if the agency report is expected to be comprehensive rather than editorial.

---

## 7. Generating & delivering the report

File: `app/api/intel/[agency]/report/route.ts`.

### 7.1 Request contract

```http
POST /api/intel/{agency}/report?template=editorial   # default
POST /api/intel/{agency}/report?template=legacy      # fallback PDF
```

**Body:**
```json
{
  "recipients": "alice@example.com, bob@example.com",   // string or string[]
  "message":    "Optional cover note, max 2000 chars."
}
```

**Auth:** any of `dg | minister | ps | agency_admin | officer` who passes `canAccessAgency()`.

**Validation:**
- `recipients` parsed via `parseEmailList` then `validateEmailList`; invalid addresses are reported back in `invalid_skipped`.
- Zero valid recipients → 400.

### 7.2 Rate limit

- **10 sends per user per rolling 60 minutes.**
- Enforced via `COUNT(*) FROM agency_intel_reports WHERE sent_by_user_id = $u AND sent_at > NOW() - INTERVAL '1 hour'`.
- 11th attempt → 429 with `"You can send at most 10 reports per hour."`.

### 7.3 Pipeline

```
requireRole + canAccessAgency
    └─→ validate recipients
        └─→ rate-limit check (Supabase COUNT)
            └─→ getAgencyIntelData(agency)
                └─→ renderIntelBriefPDF | renderAgencyIntelReportPDF
                    └─→ resolveDGRecipientName (Brief only)
                        └─→ sendEmail (attachment + HTML + text)
                            └─→ INSERT agency_intel_reports (audit + rate-limit row)
```

If `sendEmail` fails → 502 and **nothing** is written to the audit log.
If the audit insert fails **after** the send → response is still 200 (email already left the building); failure is logged for backfill.

### 7.4 Email envelope

- **Subject:** `[DG Work OS] {AGENCY} Intel Report — {YYYY-MM-DD}`
- **Attachment:** `{agency}-intel-{YYYY-MM-DD}.pdf` (PDF buffer)
- **Reply-To:** the triggering user's email (not the system mailbox)
- **HTML body:** rendered inline in `renderEmailHtml()`:
  - Header banner: gold "{Agency} Intel Report" + ministry sub-title
  - Body: greeting, `"{Sender} has shared the {Agency} Intel Report — {date}."`, optional gold-left-bordered quote with the cover note, reply-to footer, opt-out line.
- **Plain-text body:** matches `renderEmailText()` — agency + date heading, sender note, optional message, reply-to line.

### 7.5 Response

```json
{
  "success": true,
  "sent_to": ["alice@…", "bob@…"],
  "invalid_skipped": ["typo-email"],
  "remaining_this_hour": 7
}
```

### 7.6 Front-end trigger

`components/intel/GenerateReportModal.tsx`:
- Reachable from the "Generate Report" button in `AgencyHero`.
- Recipient input (comma-separated), optional message (counter, 2000 cap).
- Surfaces 429 / 400 errors verbatim.
- Auto-closes 1.5s after a successful send.

---

## 8. Audit log & rate-limit primitive

Migration: `supabase/migrations/109_agency_intel_reports.sql`.

```sql
CREATE TABLE agency_intel_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  agency          TEXT NOT NULL,                -- display form, e.g. "GPL"
  recipients      TEXT[] NOT NULL,              -- valid addresses only
  message         TEXT,                         -- nullable cover note
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- Indexes: `(sent_by_user_id, sent_at DESC)` for rate-limit COUNT; `(agency, sent_at DESC)` for audit views.
- **Append-only** — RLS grants SELECT to the sender or any DG-or-above, INSERT to authenticated users for their own rows; no UPDATE or DELETE policies. `service_role` has full access for backend operations.

---

## 9. Files involved (canonical paths)

**Pages / routes**
- `app/intel/page.tsx` — overview index (picker grid)
- `app/intel/[agency]/page.tsx` — deep-dive Bento page
- `app/intel/pending-applications/page.tsx` — GPL/GWI applications view
- `app/intel/gpl/dbis/page.tsx`
- `app/intel/gpl/methodology/page.tsx`
- `app/api/intel/summary/route.ts` — batched counts for the picker
- `app/api/intel/[agency]/route.ts` — full intel data for one agency
- `app/api/intel/[agency]/report/route.ts` — PDF + email

**Data**
- `lib/intel/get-agency-intel-data.ts` — single source of truth (~450 lines, parallel queries)
- `lib/intel/agency-bento-data.ts` — bento href map + SAIDI/SAIFI formatting
- `lib/agencies.ts` — agency dictionary, accent palette, `isIntelAgency`
- `lib/agency-health.ts` — health-tier metadata
- `lib/email-validation.ts` — `parseEmailList`, `validateEmailList`

**Components**
- `components/intel/bento/AgencyBento.tsx`
- `components/intel/bento/AgencyHero.tsx`
- `components/intel/bento/cards/*.tsx` (one per card type)
- `components/intel/common/*.tsx` (primitives + format helpers)
- `components/intel/GenerateReportModal.tsx`

**PDF**
- `lib/pdf/intel-brief-render.tsx` — editorial Brief renderer
- `lib/pdf/intel-brief-tokens.ts` — palette, typography, layout tokens
- `lib/pdf/intel-brief-issue.ts` — Vol/No date logic
- `lib/pdf/agency-intel-report.tsx` — legacy dashboard PDF (fallback)
- `public/fonts/Inter-{Light,Regular,Italic,Bold}.ttf`

**Database**
- `supabase/migrations/109_agency_intel_reports.sql`

---

## 10. Audit findings — things worth knowing

These are observations from this audit, not bugs in scope to fix today.

1. **Bento ≠ Brief.** The on-screen Bento for GPL carries six extra cards (grid reliability, outages, station heatmap, app pipeline, pending apps, aggregates). The PDF Brief carries **none** of them — only Tasks / Projects / Procurement. If stakeholders expect the PDF to mirror the screen, this is the gap.
2. **Hard caps are silent.** 30 tasks / 25 projects / 25 procurements / 12 coda items. There is no "+N more" indicator in the PDF. Heavy weeks lose tail items without notice.
3. **Audit log records `agency` as display form** (e.g. `"GPL"`), not the canonical lowercase code used everywhere else. Filtering audit reports by agency requires matching the display string.
4. **`sent_by_user_id` is `ON DELETE SET NULL`** — deactivating a user nulls the audit pointer; the recipient list and message survive.
5. **The Brief is always addressed to the active DG**, regardless of which role triggers Generate Report. The sender's name only appears in the footer and as the Reply-To. This is intentional (the publication has one named reader) but is non-obvious to operators.
6. **Placeholder owner filtering** matches case-insensitive `/placeholder|TBD|unassigned|^—$/i`. Names like `"TBD — interim"` are flagged as unassigned; names like `"To Be Determined"` (no abbreviation) are not.
7. **Volume numbering is stateless** — derived from year and ISO week. Re-generating last week's Brief today produces this week's masthead. There is no archive of issued briefs beyond the audit table (which stores recipients and time, not the rendered PDF).
8. **Caching:** Bento data is cached 60s server-side. A user who triggers Generate Report immediately after editing a task may receive a PDF that lags the screen by up to 60s. Acceptable for an editorial brief, worth noting for incident-response use.
9. **No "Brief preview"** is available before sending. The first time a user sees the rendered PDF is in the recipients' inboxes. Combined with the 10/hour rate limit, dry-run experimentation is constrained.
10. **Legacy template is reachable but unadvertised** — `?template=legacy` is the only way in; there is no UI toggle. It exists as a production escape hatch, not a feature.
