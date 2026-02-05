# DG Work OS — Project Context for Claude Code

## What This Is

A unified executive Work OS for the Director General of the Ministry of Public Utilities and Aviation (Guyana). It merges two previously separate projects:

1. **DG Command Center** — Next.js 16 + TypeScript app with Daily Briefing (Notion tasks + Google Calendar), Project Tracker (PSIP oversight), and Document Vault (AI-powered doc management)
2. **Ministry Dashboard** — Vite + React 18 frontend with Express.js backend. Agency operational monitoring for GPL (power), CJIA (airport), GWI (water), GCAA (aviation). Includes data entry workflows, JWT auth, GPL forecasting, and admin portal.

## Tech Stack

- **Framework:** Next.js 16 (App Router) with TypeScript
- **Styling:** Tailwind CSS v4 with custom design tokens
- **Database:** Supabase (primary) + direct PostgreSQL connection for Ministry metric tables
- **AI:** Anthropic Claude API (@anthropic-ai/sdk)
- **Integrations:** Notion API, Google Calendar API, Gmail/SMTP
- **Charts:** recharts (client components only)
- **Auth:** JWT (for data entry/admin routes only — DG views are unprotected)

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
/projects .................. PSIP Project Tracker (agency summaries + upload)
/projects/[id] ............. Project Detail
/projects/agency/[agency] .. Per-Agency Project List
/projects/delayed .......... Delayed Projects
/projects/problems ......... Flagged Issues
/documents ................. Document Vault (list + upload + search)
/documents/[id] ............ Document Viewer + AI Q&A
/admin ..................... User Management + Data Entry Portal
```

## Sidebar

Collapsible sidebar with sections:
- **Main Menu:** Daily Briefing, Agency Intel, Projects, Documents
- **Agencies:** GPL, GWI, CJIA, GCAA (links to /intel/[agency])
- **Admin:** Settings, Data Entry (conditional on auth role)

## Source Projects Location

The two source projects to merge are in:
- `./source/dg-command-center/` — Next.js project (copy from as-is, it's already the right stack)
- `./source/ministry-dashboard/` — Vite frontend in `frontend/`, Express backend in `backend/`

## Key Migration Rules

### Express → Next.js API Routes
- Each Express route becomes a `route.ts` file under `app/api/`
- `req.body` → `await request.json()`
- `req.file` (multer) → `await request.formData()`
- `res.json()` → `NextResponse.json()`
- Auth middleware → helper function called at top of route handler
- Rate limiting → Next.js middleware or per-route logic

### Vite React → Next.js App Router
- All Ministry Dashboard components need `'use client'` directive
- `import.meta.env.VITE_API_URL` → remove (use relative `/api/` paths)
- `react-router-dom` → Next.js `Link` + `useRouter` + `usePathname`
- `useState` for view switching → Next.js page-based routing where appropriate
- Keep `recharts` imports in client components only

### TypeScript
- Ministry Dashboard JS files should be converted to TypeScript
- Start with `// @ts-nocheck` if full typing would slow progress, add types incrementally
- DG Command Center files are already TypeScript — copy as-is

## Database

Two database connections:

1. **Supabase** (`lib/db.ts`) — Documents, tasks, projects, calendar events
2. **PostgreSQL pool** (`lib/db-pg.ts`) — Ministry metric tables (users, CJIA metrics, GWI metrics, GPL data, audit logs)

Both use the `pg` library under the hood. Supabase wraps it with its client SDK.

## API Route Organization

```
app/api/
├── briefing/route.ts          # GET — Daily briefing from Notion + Calendar
├── tasks/
│   ├── route.ts               # GET/POST — Notion task CRUD
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
│   ├── notion/route.ts        # POST — Sync Notion
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
│   ├── login/route.ts         # POST
│   ├── logout/route.ts        # POST
│   ├── register/route.ts      # POST
│   ├── refresh/route.ts       # POST
│   └── profile/route.ts       # GET
├── admin/
│   ├── users/route.ts         # GET/POST — User management
│   ├── users/[id]/route.ts    # PATCH
│   └── audit/route.ts         # GET — Audit logs
├── alerts/
│   ├── route.ts               # GET
│   └── [id]/route.ts          # PATCH — Acknowledge/resolve
└── upload/
    └── daily/route.ts         # POST — Daily Excel upload
```

## Important Files to Preserve Logic From

### DG Command Center (copy nearly as-is)
- `lib/briefing.ts` — Briefing generation logic
- `lib/notion.ts` — Full Notion CRUD with task/meeting types
- `lib/google-calendar.ts` — Calendar sync
- `lib/document-*.ts` — All document processing (analyzer, parser, search, qa)
- `lib/excel-parser.ts` — PSIP Excel parsing
- `lib/project-queries.ts` — Project database queries
- `lib/change-detector.ts` — PSIP change tracking
- `components/briefing/BriefingDashboard.tsx` — Main briefing UI
- `components/documents/*` — Full document vault UI
- `components/projects/*` — Full project tracker UI

### Ministry Dashboard (needs conversion to TS + Next.js patterns)
- `backend/src/services/gplStatusParser.js` — Critical GPL DBIS parsing logic
- `backend/src/services/gplForecasting.js` — Demand forecasting algorithms
- `backend/src/services/gplForecastAI.js` — Claude API integration for forecasts
- `backend/src/services/gplMultivariateForecast.js` — Scenario-based forecasting
- `backend/src/services/gplKpiCsvParser.js` — Monthly KPI CSV parsing
- `backend/src/services/gplScheduleParser.js` — Generation schedule parsing
- `backend/src/services/dailyExcelParser.js` — Wide-format daily Excel parser
- `backend/src/services/aiAnalysisService.js` — General AI analysis service
- `backend/src/services/auditService.js` — Audit logging
- `backend/src/services/emailService.js` — Email notifications
- `backend/src/services/excelParser.js` — GPL Excel parsing
- `backend/src/middleware/auth.js` — JWT authentication logic
- `backend/src/config/database.js` — PG pool configuration
- `backend/src/controllers/*.js` — All controller logic (converts to route handlers)
- `frontend/src/components/agencies/GPLDetail.jsx` — Massive GPL detail component
- `frontend/src/components/agencies/CJIADetail.jsx` — CJIA passenger analytics
- `frontend/src/components/agencies/GWIDetail.jsx` — GWI metrics
- `frontend/src/components/agencies/GCAADetail.jsx` — GCAA compliance
- `frontend/src/hooks/useAgencyData.js` — Agency data fetching + transformation
- `frontend/src/data/mockData.js` — Mock data for CJIA/GWI/GCAA
- `frontend/src/components/summary/*` — Overview components
- `frontend/src/components/layout/SlidePanel.jsx` — Reusable slide panel
- `frontend/src/components/common/*` — Shared UI components
- `frontend/src/components/GPL*.jsx` — GPL upload and chart components
