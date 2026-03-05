# DG Work OS — Project Context for Claude Code

## What This Is

A multi-user executive Work OS for the Ministry of Public Utilities and Aviation (Guyana). Features include Daily Briefing (tasks + Google Calendar), Task Board (Kanban), Project Tracker (PSIP oversight), Document Vault (AI-powered doc management), Agency Intel (GPL, CJIA, GWI, GCAA operational monitoring), Oversight dashboard, Budget tracking, and Meeting management.

## Tech Stack

- **Framework:** Next.js 16 (App Router) with TypeScript
- **Styling:** Tailwind CSS v4 with custom design tokens
- **Database:** Supabase (primary) + direct PostgreSQL connection for Ministry metric tables
- **AI:** Anthropic Claude API (@anthropic-ai/sdk)
- **Integrations:** Google Calendar API, Gmail/SMTP
- **Charts:** recharts (client components only)
- **Auth:** NextAuth v5 (beta) with Google Workspace OAuth — all routes protected
- **Roles:** dg | minister | ps | agency_admin | officer

## Design System

Dark navy + gold executive theme. All colors use CSS custom properties defined in `globals.css`.

```
Background:     #0a1628 (--navy-950)
Card surface:   #1a2744 (--navy-900)
Borders:        #2d3a52 (--navy-800)
Muted text:     #64748b (--navy-600)
Primary accent: #d4af37 (--gold-500)
Success:        #059669
Warning:        #d4af37
Critical:       #dc2626
```

- Font: Outfit (sans-serif), JetBrains Mono (monospace)
- Cards use `card-premium` class (glass-morphism gradient backgrounds)
- Buttons use `btn-navy` class
- Sidebar items use `sidebar-item` class with `active` state

## UX Principles

**Progressive disclosure everywhere.** The DG does not want information overload.

1. **Summary level** — Compact cards with 2-3 key metrics + status badge. No charts.
2. **Expanded level** — Click/tap to expand inline OR open slide panel. Shows charts and breakdowns.
3. **Detail level** — Full page with tabs for deep exploration.

Patterns:
- `CollapsibleSection` component for expand/collapse
- `SlidePanel` component for detail overlays
- Click-to-expand rows in tables and lists
- Inline task editing from briefing view
- Tabbed views for multi-faceted data (e.g., GPL: Overview | Stations | KPIs | Forecast)

## Navigation Structure

```
/ .......................... Daily Briefing (home)
/intel ..................... Agency Intel Overview (summary cards + alerts)
/intel/gpl ................. GPL Deep Dive (tabbed: overview, stations, KPIs, forecast)
/intel/cjia ................ CJIA Passenger Analytics
/intel/gwi ................. GWI Metrics
/intel/gcaa ................ GCAA Compliance
/tasks ..................... Task Board (Kanban)
/oversight ................. Oversight Dashboard
/budget .................... Budget 2026
/meetings .................. Meetings
/documents ................. Document Vault (list + upload + search)
/documents/[id] ............ Document Viewer + AI Q&A
/projects .................. PSIP Project Tracker (agency summaries + upload)
/projects/[id] ............. Project Detail
/projects/agency/[agency] .. Per-Agency Project List
/projects/delayed .......... Delayed Projects
/projects/problems ......... Flagged Issues
/admin ..................... Settings (AI usage, notifications)
/admin/people .............. User Management (DG only)
/admin/tasks ............... Command Center
/login ..................... Google OAuth sign-in
```

## Sidebar

Collapsible sidebar with sections:
- **Main Menu:** Daily Briefing, Agency Intel, Task Board, Oversight, Budget, Meetings, Documents
- **Agencies:** GPL, GWI, CJIA, GCAA (links to /intel/[agency])
- **Admin:** Command Center, People, Settings (visible to dg/minister/ps only)
- Agency users only see their own agency in the sidebar

## Authentication

- **NextAuth v5** (beta 30) with Google Workspace OAuth
- `lib/auth.ts` — NextAuth config, exports `{ handlers, auth, signIn, signOut }`
- `lib/auth-helpers.ts` — `requireRole()`, `canAccessAgency()`, `canUploadData()`, `canAssignTasks()`
- `middleware.ts` — Redirects unauthenticated users to `/login`; public paths: `/login`, `/api/auth`, `/api/push`, `/api/webhooks`, `/serwist`, `/upload`
- `components/providers/SessionProvider.tsx` — Wraps app with `<SessionProvider>` for `useSession()` in client components
- Module augmentation: `declare module '@auth/core/jwt'` (NOT `next-auth/jwt`)
- Backward-compatible shims in `lib/auth.ts`: `authenticateAny()`, `authenticateFromCookie()`, `authorizeRoles()` — bridge old PG routes to NextAuth sessions
- `authorizeRoles()` maps old role names: `director` → `dg`, `admin` → `dg/agency_admin`
- All new routes use `requireRole(['dg', 'ps', ...])` from `lib/auth-helpers.ts`

## Database

Two database connections:

1. **Supabase** (`lib/db.ts`) — Users, tasks, documents, projects, calendar events, notifications, integration tokens
2. **PostgreSQL pool** (`lib/db-pg.ts`) — Ministry metric tables (CJIA metrics, GWI metrics, GPL data, audit logs, legacy task management)

Users table is in Supabase (see `supabase/migrations/021_multi_user.sql`). Tasks table is in Supabase (see `supabase/migrations/022_tasks.sql`).

## API Route Organization

```
app/api/
├── briefing/route.ts          # GET — Daily briefing (tasks + calendar)
├── tasks/
│   ├── route.ts               # GET/POST — Task CRUD (Supabase)
│   └── [id]/route.ts          # PATCH/DELETE — Single task
├── documents/
│   ├── route.ts               # GET — List documents
│   ├── upload/route.ts        # POST — Upload + AI analysis
│   ├── search/route.ts        # GET — Semantic search
│   └── [id]/
│       ├── route.ts           # GET/DELETE — Single document
│       └── ask/route.ts       # POST — Q&A with Claude
├── projects/
│   ├── route.ts               # GET — Project summaries
│   ├── upload/route.ts        # POST — Excel upload
│   ├── [id]/route.ts          # GET — Single project
│   └── changes/route.ts       # GET — Change log
├── calendar/
│   ├── route.ts               # GET/POST — Calendar events
│   └── [id]/route.ts          # PATCH/DELETE
├── sync/
│   └── calendar/route.ts      # POST — Sync Calendar
├── dashboard/route.ts         # GET — Agency overview data
├── metrics/
│   ├── gpl/
│   │   ├── route.ts           # POST — Submit GPL metrics
│   │   ├── dbis/route.ts      # POST — DBIS daily report
│   │   └── stations/route.ts  # GET — Station config
│   ├── cjia/route.ts          # POST — Submit CJIA metrics
│   ├── gwi/route.ts           # POST — Submit GWI metrics
│   └── gcaa/route.ts          # POST — Submit GCAA metrics
├── gpl/
│   ├── upload/route.ts        # POST — GPL Excel upload + preview
│   ├── upload/confirm/route.ts # POST — Confirm upload
│   ├── latest/route.ts        # GET — Latest GPL data
│   ├── daily/[date]/route.ts  # GET — GPL data by date
│   ├── history/route.ts       # GET — Upload history
│   ├── analysis/[id]/route.ts # GET/POST — AI analysis
│   ├── kpi/
│   │   ├── upload/route.ts    # POST — KPI CSV upload
│   │   ├── latest/route.ts    # GET — Latest KPIs
│   │   ├── trends/route.ts    # GET — KPI trends
│   │   └── analysis/route.ts  # GET — AI KPI analysis
│   └── forecast/
│       ├── route.ts           # GET — All forecasts
│       ├── demand/route.ts    # GET — Demand forecast
│       ├── capacity/route.ts  # GET — Capacity timeline
│       ├── stations/route.ts  # GET — Station reliability
│       ├── briefing/route.ts  # GET — AI strategic briefing
│       ├── refresh/route.ts   # POST — Recalculate
│       └── multivariate/route.ts # GET/POST — Scenario forecasts
├── auth/
│   └── [...nextauth]/route.ts # NextAuth v5 handler (GET/POST)
├── admin/
│   ├── users/route.ts         # GET — List users (DG/Minister/PS)
│   ├── users/[id]/route.ts    # PATCH — Update role/agency/active (DG only)
│   └── audit/route.ts         # GET — Audit logs
├── alerts/
│   ├── route.ts               # GET
│   └── [id]/route.ts          # PATCH — Acknowledge/resolve
└── upload/
    └── daily/route.ts         # POST — Daily Excel upload
```

## Key Files

### Auth
- `lib/auth.ts` — NextAuth config + backward-compatible shims
- `lib/auth-helpers.ts` — `requireRole()` and access control helpers
- `middleware.ts` — Route protection + public path allowlist
- `components/providers/SessionProvider.tsx` — Client-side session provider
- `app/api/auth/[...nextauth]/route.ts` — NextAuth route handler

### Core
- `lib/briefing.ts` — Daily briefing generation (tasks + calendar)
- `lib/google-calendar.ts` — Per-user Google Calendar API (server-only)
- `lib/calendar-types.ts` — Shared calendar types (client-safe)
- `lib/task-types.ts` — Task type definitions
- `lib/integration-tokens.ts` — Google Calendar token storage
- `lib/document-*.ts` — Document processing (analyzer, parser, search, qa)
- `lib/excel-parser.ts` — PSIP Excel parsing
- `lib/project-queries.ts` — Project database queries

### Components
- `components/layout/Sidebar.tsx` — Role-aware sidebar navigation
- `components/layout/AppShell.tsx` — App shell with session-aware header
- `components/briefing/BriefingDashboard.tsx` — Main briefing UI
- `components/tasks/KanbanBoard.tsx` — Task board (Kanban)
- `components/documents/*` — Full document vault UI
- `components/projects/*` — Full project tracker UI
