# DG Work OS

Executive Work OS for the Director General — Ministry of Public Utilities & Aviation (Guyana).

Unified platform merging the **DG Command Center** (daily briefing, project tracker, document vault) with the **Ministry Dashboard** (agency operational monitoring for GPL, CJIA, GWI, GCAA).

## Tech Stack

- **Framework:** Next.js 16 (App Router) with TypeScript
- **Styling:** Tailwind CSS v4 with custom design tokens
- **Database:** Supabase + PostgreSQL
- **AI:** Anthropic Claude API
- **Integrations:** Notion API, Google Calendar API, SMTP email
- **Charts:** Recharts

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Supabase project (for documents, tasks, projects)

### Install

```bash
npm install
```

### Environment

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`. See `.env.example` for the full list of required variables.

### Database

Run the migration files in order against your PostgreSQL database:

```bash
psql -d ministry_dashboard -f database/001_users.sql
psql -d ministry_dashboard -f database/002_cjia_metrics.sql
psql -d ministry_dashboard -f database/003_gwi_metrics.sql
psql -d ministry_dashboard -f database/004_gpl_data.sql
psql -d ministry_dashboard -f database/005_audit_logs.sql
psql -d ministry_dashboard -f database/006_gcaa_metrics.sql
psql -d ministry_dashboard -f database/007_alerts.sql
psql -d ministry_dashboard -f database/seed.sql
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/                    Pages and API routes (Next.js App Router)
  api/                  67 API route handlers
components/
  briefing/             Daily briefing UI
  documents/            Document vault UI
  intel/                Agency monitoring (GPL, CJIA, GWI, GCAA)
  layout/               Sidebar, mobile menu
  projects/             PSIP project tracker UI
  ui/                   Shared components (Badge, CollapsibleSection, etc.)
lib/                    Server-side services and utilities
database/               PostgreSQL migration files
```

## Navigation

| Route | Page |
|-------|------|
| `/` | Daily Briefing |
| `/intel` | Agency Intel Overview |
| `/intel/gpl` | GPL Deep Dive (stations, KPIs, forecast) |
| `/intel/cjia` | CJIA Passenger Analytics |
| `/intel/gwi` | GWI Water Metrics |
| `/intel/gcaa` | GCAA Aviation Compliance |
| `/projects` | PSIP Project Tracker |
| `/projects/[id]` | Project Detail |
| `/documents` | Document Vault |
| `/documents/[id]` | Document Viewer + AI Q&A |
| `/admin` | User Management |

## Build

```bash
npm run build
```
