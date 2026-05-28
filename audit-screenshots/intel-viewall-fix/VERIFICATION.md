# Intel View-all Fix — Verification Notes

**Branch:** `fix/intel-viewall-agency-filter`
**PR:** https://github.com/alfonsodearmas-a11y/-dg-work-os/pull/10
**Preview:** https://dg-work-5nlitxnrn-alfonso-de-armas-projects.vercel.app
**Commit:** e4ac005

## What's been verified

- ✅ Typecheck clean (modulo the 3 documented pre-existing `RequestInit/AbortSignal` test-file errors)
- ✅ `npm run build` clean — 214 static pages generated, `/intel/[agency]`, `/tasks`, `/projects/delayed`, `/procurement` all render
- ✅ Vercel preview build green (`gh pr checks 10` — both Vercel and Vercel Preview Comments pass)
- ✅ Preview URL reachable (screenshot `02-preview-intel-heci-vercel-sso-gate.png` — Vercel SSO gate confirms deploy is live)
- ✅ Production URL reachable for the same path (screenshot `01-production-intel-heci-login-gate.png` — NextAuth redirect to /login)

## What can't be verified from this environment

The preview is behind **Vercel Deployment Protection** (team SSO) and the app itself is behind **NextAuth Google Workspace OAuth**. Playwright in this environment has no credentials for either, so I cannot perform the authenticated click-through smoke test that would exercise the actual hrefs end-to-end. The user has explicitly said they'll review the preview themselves, so this hands off the visual verification step to them.

## Static verification — what each click does

### 1. View all → Tasks (on `/intel/heci`)

| Layer | What I changed | Resulting behavior |
|---|---|---|
| Bento href | `lib/intel/agency-bento-data.ts:48` → `'/tasks?agency=HECI'` | Link renders with `href="/tasks?agency=HECI"` |
| URL → state | `hooks/useBoardUrlSync.ts:38-39` (existing, unchanged) | `state.agencyFilter` hydrated to `['HECI']` on mount |
| State → API | `components/tasks/KanbanBoard.tsx:160-167` (new) | Fetch URL becomes `/api/tasks?agency=HECI` |
| API → DB | `app/api/tasks/route.ts:91-95` (new) | Server runs `query.eq('agency', 'HECI')` |
| Filter chip | `components/tasks/KanbanFilters.tsx:34-37` (existing) | "HECI" pill renders selected via existing FilterPill machinery |

### 2. View all → Projects (on `/intel/heci`)

| Layer | What I changed | Resulting behavior |
|---|---|---|
| Bento href | `lib/intel/agency-bento-data.ts:49` → `'/projects/delayed?agency=HECI'` | Link renders with `href="/projects/delayed?agency=HECI"` |
| Page reads URL | `app/projects/delayed/page.tsx:14-17` (new) | `agency = 'HECI'` |
| Page → API | Same file:21 (new) | Fetch URL becomes `/api/projects/delayed?agency=HECI` |
| API → lib | `app/api/projects/delayed/route.ts:13-14` (new) | Calls `getDelayedProjects('HECI')` |
| Lib → DB | `lib/project-queries.ts:495` (new) | Server runs `query.eq('sub_agency', 'HECI')` |
| UI subtitle | `app/projects/delayed/page.tsx:34-44` (new) | Renders "scoped to Hinterland Electrification" + dismissible chip back to unfiltered |

### 3. View all → Procurement (on `/intel/heci`)

| Layer | What I changed | Resulting behavior |
|---|---|---|
| Bento href | `lib/intel/agency-bento-data.ts:50` → `'/procurement?agency=HECI'` | Link renders with `href="/procurement?agency=HECI"` |
| URL → state | `components/procurement/ProcurementKanban.tsx:87` (new) | `useState(() => searchParams.get('agency') ?? '')` seeds to `'HECI'` |
| State → filter | Same file:158-162 (existing) | `tenders.filter(t => t.agency.toUpperCase() === 'HECI')` |
| Filter chip | Same file:288-298 (existing) | "HECI" chip renders selected because `agencyFilter === 'HECI'` |

## The same logic produces, for each agency

| Slug | `?agency=` value |
|---|---|
| `gpl` | `GPL` |
| `gwi` | `GWI` |
| `cjia` | `CJIA` |
| `gcaa` | `GCAA` |
| `heci` | `HECI` |
| `marad` | `MARAD` |
| `has` | `HAS` |

## Known data-canonicalization caveat (pre-existing, not in scope)

`has` slug → `?agency=HAS`. The DB convention is mixed:
- `lib/intel/get-agency-intel-data.ts` queries with `agency.toUpperCase()` → `'HAS'`. So the intel surface itself uses `HAS`.
- `lib/constants/agencies.ts:5` filters `HAS` out of `SELECTABLE_AGENCIES` in favor of `HINTERLAND_AIRSTRIPS` and notes `HAS` as a "legacy alias".
- `lib/constants/agencies.ts:20` keeps `AGENCY_NAMES.HAS` as a label fallback.

If `tender.agency` rows for HAS are stored as `'HINTERLAND_AIRSTRIPS'`, the View-all link from `/intel/has` to `/procurement?agency=HAS` will surface zero matches even though the intel bento itself shows HAS data. Same risk for `tasks.agency` and `projects.sub_agency` — depends on what the upload pipeline writes for HAS rows.

Following the user's stated convention `?agency=${slug.toUpperCase()}` and the intel surface's own canonicalization, this is the consistent choice. The data-canonicalization split is pre-existing and not addressed in this PR.

## Manual click-through checklist (for the reviewer)

Open the preview, sign in via Google OAuth, then on each agency:

- [ ] `/intel/heci` — click "View all" on each of Tasks, Projects, Procurement
  - URL contains `?agency=HECI`
  - Tasks: HECI filter chip selected, only HECI rows
  - Projects: header reads "scoped to Hinterland Electrification", dismiss chip works
  - Procurement: HECI filter chip selected, only HECI rows
- [ ] `/intel/gpl` — same three clicks (data-heavy agency)
- [ ] `/intel/marad` — same three clicks (sparse agency, exercise empty-state path)
- [ ] (Optional) `/intel/has` — note the canonicalization caveat above; expect possible zero results on Procurement

## Screenshots

- `01-production-intel-heci-login-gate.png` — production `/intel/heci` redirecting to `/login` (NextAuth gate; route resolves)
- `02-preview-intel-heci-vercel-sso-gate.png` — preview deployment Vercel SSO gate (preview is live, but requires team-SSO login to access)
