# DG Work OS — Codebase Audit for Procurement Module

## Folder structure

```
app/                           # Next.js 16 App Router pages
  ├── layout.tsx               # Root layout (fonts, providers, AppShell)
  ├── globals.css              # Design system (2196 lines, all custom properties + utility classes)
  ├── page.tsx                 # Home → Mission Control
  ├── applications/            # Pending Applications module (reference pattern)
  │   ├── page.tsx             # List view (client component, filters, drawer)
  │   ├── [id]/page.tsx        # Detail page (tabs: Info | Documents | Activity | Notes)
  │   └── new/page.tsx         # Create form
  ├── api/                     # API routes
  │   ├── applications/        # Reference pattern for CRUD + notes + documents
  │   └── ...
  ├── tasks/page.tsx           # Task Board (Kanban)
  └── intel/                   # Agency deep-dive pages (tabbed)

components/
  ├── ui/                      # Shared UI primitives
  │   ├── Card.tsx             # Card, CardHeader, CardContent
  │   ├── Badge.tsx            # Badge with 6 variants
  │   ├── Tabs.tsx             # Accessible tabs with arrow keys
  │   ├── CollapsibleSection.tsx
  │   ├── Spinner.tsx          # Gold spinner (3 sizes)
  │   ├── EmptyState.tsx       # Empty state with icon + title + action
  │   ├── Toast.tsx            # ToastProvider + useToast()
  │   └── Table.tsx            # Table, TableHeader, TableBody, etc.
  ├── layout/
  │   ├── Sidebar.tsx          # Role-aware collapsible nav
  │   ├── AppShell.tsx         # App shell wrapper
  │   └── SlidePanel.tsx       # Right-side detail overlay (600/700px)
  ├── tasks/                   # Kanban board components
  └── ...

lib/
  ├── db.ts                    # Supabase client (supabase, supabaseAdmin)
  ├── db-pg.ts                 # PostgreSQL pool (query, getClient, transaction)
  ├── auth.ts                  # NextAuth v5 config
  ├── auth-helpers.ts          # requireRole(), canAccessAgency(), etc.
  ├── task-types.ts            # Task type definitions
  ├── constants/agencies.ts    # AGENCY_CODES, AGENCY_NAMES, status mappings
  └── modules/access.ts        # canAccessModule(), requireModuleAccess()

types/
  └── projects.ts              # Project type definitions

hooks/
  └── (18 custom hooks)

supabase/
  └── migrations/              # 051 migration files (001–051)
```

## Design system

### Fonts
- **Sans:** Outfit — loaded via `next/font/google` with `display: 'swap'`, exposed as CSS variable `--font-outfit`
- **Mono:** JetBrains Mono — loaded via `next/font/google`, exposed as CSS variable `--font-jetbrains`
- Tailwind references: `--font-sans: var(--font-outfit)`, `--font-mono: var(--font-jetbrains)`
- Base font-size: 15px on body
- Font features: `'cv11', 'ss01'`
- Heading weight: 600, letter-spacing: -0.02em (h2/h3), -0.03em (h1)
- h1: `clamp(1.5rem, 4vw, 2.25rem)`, h2: `clamp(1.25rem, 3.5vw, 1.75rem)`, h3: `clamp(1.125rem, 3vw, 1.5rem)`

### Colors

**CSS Custom Properties (`:root` and `@theme inline`):**

| Variable | Hex | Usage |
|---|---|---|
| `--navy-950` / `--color-navy-950` | `#0a1628` | Page background |
| `--navy-900` / `--color-navy-900` | `#1a2744` | Card surface, sidebar |
| `--navy-800` / `--color-navy-800` | `#2d3a52` | Borders, dividers |
| `--navy-700` / `--color-navy-700` | `#4a5568` | Scrollbar thumb, status-info |
| `--navy-600` / `--color-navy-600` | `#64748b` | Muted text, placeholders |
| `--gold-600` / `--color-gold-600` | `#b8860b` | Gold dark (gradient end) |
| `--gold-500` / `--color-gold-500` | `#d4af37` | Primary accent, active states |
| `--gold-400` / `--color-gold-400` | `#f4d03f` | Gold light (gradient start) |
| `--gold-300` / `--color-gold-300` | `#fbbf24` | Gold highlight |
| `--gold-100` / `--color-gold-100` | `#fef3c7` | Gold tint |
| `--status-success` | `#059669` | Success (emerald-600) |
| `--status-error` | `#dc2626` | Error (red-600) |
| `--status-warning` | `#d4af37` | Warning (same as gold-500) |
| `--status-info` | `#4a5568` | Info (same as navy-700) |
| `--background` | `#0a1628` | Body bg |
| `--foreground` | `#f8fafc` | Body text (slate-50) |
| `--card-bg` | `linear-gradient(135deg, #1a2744 0%, #0a1628 100%)` | Card gradient |

**Transition durations:** `--duration-fast: 150ms`, `--duration-normal: 250ms`, `--duration-slow: 400ms`

### Spacing and radius
- **Border radius:** 8px (buttons, inputs, sidebar items, collapsible headers), 12px (glass-card), 16px (card-premium, upload-zone)
- **Card padding:** `px-6 py-4` (CardHeader, CardContent)
- **Sidebar item padding:** `0.875rem 1.25rem`, margin: `0.25rem 0.75rem`
- **Button padding:** `0.75rem 1.5rem`
- **Input padding:** `0.75rem 1rem`
- **Common gap:** `gap-2`, `gap-3`, `gap-4`

### Card styles

**`.card-premium` (primary card class):**
```css
background: linear-gradient(135deg, rgba(26, 39, 68, 0.9) 0%, rgba(10, 22, 40, 0.95) 100%);
border: 1px solid rgba(45, 58, 82, 0.6);
border-radius: 16px;
backdrop-filter: blur(10px);
box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
transition: all 0.2s ease;
```
Hover: `border-color: rgba(212, 175, 55, 0.5); box-shadow: 0 8px 32px rgba(212, 175, 55, 0.15); transform: translateY(-2px);`

**`.glass-card`:**
```css
background: rgba(26, 39, 68, 0.6);
backdrop-filter: blur(16px);
border: 1px solid rgba(45, 58, 82, 0.5);
border-radius: 12px;
```

**Card component (`components/ui/Card.tsx`):**
```tsx
<div className="card-premium">...</div>
// CardHeader: px-6 py-4 border-b border-navy-800
// CardContent: px-6 py-4
```

### Badge/pill styles

**Badge component (`components/ui/Badge.tsx`):**
```tsx
// Base: inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium
variants = {
  default: 'bg-navy-700/30 text-slate-400',
  success: 'bg-emerald-500/20 text-emerald-400',
  warning: 'bg-amber-500/20 text-amber-400',
  danger: 'bg-red-500/20 text-red-400',
  info: 'bg-blue-500/20 text-blue-400',
  gold: 'bg-gold-500/20 text-gold-400',
}
```

**CSS badge classes (globals.css):**
```css
.badge-gold { background: rgba(212, 175, 55, 0.2); color: #f4d03f; border: 1px solid rgba(212, 175, 55, 0.3); }
.badge-success { background: rgba(5, 150, 105, 0.2); color: #34d399; border: 1px solid rgba(5, 150, 105, 0.3); }
.badge-danger { background: rgba(220, 38, 38, 0.2); color: #f87171; border: 1px solid rgba(220, 38, 38, 0.3); }
.badge-info { background: rgba(74, 85, 104, 0.3); color: #94a3b8; border: 1px solid rgba(74, 85, 104, 0.4); }
```

### Button styles

**`.btn-gold` (primary action):**
```css
background: linear-gradient(135deg, #d4af37 0%, #b8860b 100%);
color: #0a1628; font-weight: 600; padding: 0.75rem 1.5rem;
border-radius: 8px; border: none; cursor: pointer;
/* Hover: */ background: linear-gradient(135deg, #f4d03f 0%, #d4af37 100%);
box-shadow: 0 4px 20px rgba(212, 175, 55, 0.4); transform: translateY(-1px);
```

**`.btn-navy` (secondary/outline):**
```css
background: transparent; color: #d4af37; font-weight: 600;
padding: 0.75rem 1.5rem; border-radius: 8px;
border: 2px solid #d4af37;
/* Hover: */ background: rgba(212, 175, 55, 0.1);
```

**Icon buttons (inline pattern):**
```tsx
<button className="p-2 rounded-lg hover:bg-navy-800 text-slate-400 hover:text-white transition-colors">
  <Icon size={20} />
</button>
```

### Form input styles

**`.input-premium` (globals.css):**
```css
background: rgba(26, 39, 68, 0.6);
border: 1px solid rgba(45, 58, 82, 0.6);
color: #f8fafc; padding: 0.75rem 1rem; border-radius: 8px;
/* Focus: */ border-color: #d4af37; box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.2);
/* Placeholder: */ color: #64748b;
```

**Typical Tailwind pattern for inputs (no `.input-premium`):**
```tsx
<input className="w-full px-3 py-2 bg-navy-900 border border-navy-800 rounded-lg text-white placeholder-navy-600 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 text-sm" />
<select className="bg-navy-900 border border-navy-800 rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-gold-500" />
<textarea className="w-full px-3 py-2 bg-navy-900 border border-navy-800 rounded-lg text-white placeholder-navy-600 focus:outline-none focus:border-gold-500 text-sm resize-none" />
```

## Component patterns

### How cards are built
Use `Card`, `CardHeader`, `CardContent` from `@/components/ui/Card`:
```tsx
import { Card, CardHeader, CardContent } from '@/components/ui/Card';

<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-white">Title</h2>
      <Badge variant="gold">Status</Badge>
    </div>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
</Card>
```

Or inline with `.card-premium` class:
```tsx
<div className="card-premium p-6">...</div>
```

### How modals/slide-overs work
**`SlidePanel` component (`components/layout/SlidePanel.tsx`):**
```tsx
import { SlidePanel } from '@/components/layout/SlidePanel';

const [panelOpen, setPanelOpen] = useState(false);

<SlidePanel
  isOpen={panelOpen}
  onClose={() => setPanelOpen(false)}
  title="Package Details"
  subtitle="GPL-2026-001"
  icon={Package}
  accentColor="from-gold-600 to-gold-500"
>
  {/* Panel content */}
</SlidePanel>
```
- Fixed right panel: `w-full sm:w-[600px] lg:w-[700px]`
- Backdrop with blur, Escape key closes, body scroll locked
- Auto-focuses first interactive element
- iOS-safe scrolling with `-webkit-overflow-scrolling: touch`

### How toasts work
**`ToastProvider` + `useToast()` from `@/components/ui/Toast`:**
```tsx
// Already wrapped in AppShell. Use in any client component:
import { useToast } from '@/components/ui/Toast';

const { toast } = useToast();
toast.success('Package advanced to Evaluation');
toast.error('Failed to update stage', 6000);
toast.warning('Package missing required documents');
toast.info('Syncing data...');
```
- Bottom-right position, auto-dismiss 4s (6s for errors)
- Max 5 toasts visible, exit animation: `translate-x-full opacity-0`

### How loading states work
**Spinner (`components/ui/Spinner.tsx`):**
```tsx
import { Spinner } from '@/components/ui/Spinner';
<Spinner size="lg" />  // sm=h-4, md=h-8, lg=h-12
```
Gold border with transparent top, CSS `animate-spin`.

**Skeleton shimmer (globals.css):**
```css
@keyframes shimmer { ... }
```
Used as inline `animate-pulse` or custom skeleton components.

**Loading text pattern:**
```tsx
if (loading) return (
  <div className="flex items-center justify-center py-12">
    <Spinner size="lg" />
    <span className="ml-3 text-navy-600">Loading packages...</span>
  </div>
);
```

**Empty state (`components/ui/EmptyState.tsx`):**
```tsx
<EmptyState
  icon={<Package className="h-12 w-12" />}
  title="No procurement packages"
  description="Submit a new package to get started."
  action={<button className="btn-gold px-4 py-2 text-sm">New Package</button>}
/>
```

### How the Kanban board is built

**Architecture:**
- `components/tasks/KanbanBoard.tsx` — Main wrapper with `BoardSelectionProvider` + `KanbanBoardInner`
- `hooks/useBoardReducer.ts` — State machine (useReducer) for board state
- `components/tasks/KanbanColumn.tsx` — Single column (status lane)
- `components/tasks/TaskCard.tsx` — Card in lane (expandable, draggable)

**Drag-and-drop:** Native HTML5 `onDragStart`, `onDragOver`, `onDrop` (not @dnd-kit despite it being in package.json)

**Column layout (desktop):**
```tsx
<div className="grid grid-cols-4 gap-4">
  {['new', 'active', 'blocked', 'done'].map(status => (
    <KanbanColumn key={status} status={status} tasks={tasksByStatus[status]} />
  ))}
</div>
```

**Mobile:** Single column with tab bar for status switching.

**Filter pattern:** `searchQuery`, `agencyFilter`, `priorityFilter`, `assigneeFilter`, `dueDateFilter`, `statusFilter`

**Optimistic updates:** PATCH to API → optimistic state update → revert on error

## Data patterns

### Supabase client
```typescript
// lib/db.ts
import { supabase, supabaseAdmin } from '@/lib/db';

// supabase — browser-side, respects RLS
// supabaseAdmin — server-side, bypasses RLS (uses SUPABASE_SERVICE_ROLE_KEY)
```

### Query structure

**API routes (server-side) use `supabaseAdmin`:**
```typescript
const { data, error } = await supabaseAdmin
  .from('table_name')
  .select('*')
  .eq('column', value)
  .order('created_at', { ascending: false });

if (error) return NextResponse.json({ error: error.message }, { status: 500 });
return NextResponse.json(data);
```

**Client-side uses `fetch()` to API routes:**
```typescript
const res = await fetch('/api/endpoint');
if (!res.ok) throw new Error('Failed to fetch');
const data = await res.json();
```

No React Query or SWR — plain `useEffect` + `useState` + `fetch`.

### Type file structure
- Types live in `lib/` files alongside their queries (e.g., `lib/task-types.ts`, `lib/people-types.ts`)
- Or in `types/` for domain types (e.g., `types/projects.ts`)
- Naming: `PascalCase` for interfaces, exported individually
- Example: `Task`, `TaskStatus`, `TaskPriority`, `ProjectNote`, `Role`

### Error handling
```typescript
// API routes:
try {
  // ... query
} catch (err) {
  console.error('Error description:', err);
  return NextResponse.json({ error: 'User-friendly message' }, { status: 500 });
}

// Client components:
try {
  const res = await fetch('/api/...');
  if (!res.ok) {
    const err = await res.json();
    toast.error(err.error || 'Something went wrong');
    return;
  }
} catch {
  toast.error('Network error');
}
```

## Navigation

### Sidebar structure
**`components/layout/Sidebar.tsx`:**
```typescript
const mainNavItems = [
  { href: '/', label: 'Mission Control', icon: LayoutDashboard, moduleSlug: 'briefing' },
  { href: '/intel', label: 'Agency Intel', icon: Activity, moduleSlug: 'agency-intel' },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, moduleSlug: 'tasks' },
  { href: '/oversight', label: 'Oversight', icon: Eye, moduleSlug: 'oversight' },
  { href: '/budget', label: 'Budget 2026', icon: DollarSign, moduleSlug: 'budget' },
  { href: '/meetings', label: 'Meetings', icon: Mic, moduleSlug: 'meetings' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, moduleSlug: 'calendar' },
  { href: '/documents', label: 'Documents', icon: FileText, moduleSlug: 'documents' },
];

const agencies = [
  { code: 'gpl', label: 'GPL', name: 'Guyana Power & Light', icon: Zap, moduleSlug: 'gpl-deep-dive' },
  { code: 'cjia', label: 'CJIA', name: 'CJIA Airport', icon: Plane, moduleSlug: 'cjia-deep-dive' },
  { code: 'gwi', label: 'GWI', name: 'Guyana Water Inc.', icon: Droplets, moduleSlug: 'gwi-deep-dive' },
  { code: 'gcaa', label: 'GCAA', name: 'Civil Aviation', icon: Shield, moduleSlug: 'gcaa-deep-dive' },
];

const adminItems = [
  { href: '/admin/people', label: 'People', icon: Users, moduleSlug: 'people' },
  { href: '/admin', label: 'Settings', icon: Settings, moduleSlug: 'settings' },
];
```

- **Icon library:** `lucide-react`
- **Role visibility:** Admin section visible to `['dg', 'minister', 'ps']` only
- **Active state:** `sidebar-item active` class (gold left border + gold bg/text)
- **Module access:** Items filtered by `useModuleAccess()` hook
- **Collapsed state:** Icon-only rail with glassmorphism tooltips on hover

### Route structure
- **App Router** (Next.js 16) — `app/` directory
- Dynamic routes use `async` + `await params` pattern
- Layout nesting: root layout → AppShell (sidebar + header) → page
- `/login` and `/upload` pages get bare layout (no sidebar)

## Role system

**Roles (from `lib/auth.ts`):**
```typescript
type Role = 'dg' | 'minister' | 'ps' | 'agency_admin' | 'officer';
```

**Permission checks (from `lib/auth-helpers.ts`):**
```typescript
// In API routes:
import { requireRole } from '@/lib/auth-helpers';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  // session.user.id, session.user.role, session.user.agency
}

// Agency access check:
import { canAccessAgency } from '@/lib/auth-helpers';
if (!canAccessAgency(session.user.role, session.user.agency, targetAgency)) {
  return NextResponse.json({ error: 'Access denied' }, { status: 403 });
}
```

**Ministry roles** (`['dg', 'minister', 'ps']`): full cross-agency visibility, no write access to agency data
**Agency roles** (`['agency_admin', 'officer']`): scoped to own agency

**Module access:** `lib/modules/access.ts` — `canAccessModule(userId, userRole, moduleSlug)`

## Existing agency references

**Agency codes (`lib/constants/agencies.ts`):**
```typescript
AGENCY_CODES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'MOPUA'] as const;
```

**User agency constraint (migration 045):**
```sql
agency IS NULL (for ministry roles dg/minister/ps)
OR LOWER(agency) IN ('gpl', 'gwi', 'cjia', 'gcaa', 'marad', 'heci', 'has')
```

**Agency FK pattern:** The `users` table has `agency TEXT` (nullable). Projects use `sub_agency TEXT`. Applications use `agency TEXT`. All comparisons are case-insensitive.

**No separate `agencies` table exists — agencies are text values, not FK to a table.**

## Migration patterns

**Naming convention:** `NNN_description.sql` — zero-padded 3-digit, next is `052`

**SQL style:**
```sql
-- ============================================================
-- Description Header
-- ============================================================

CREATE TABLE IF NOT EXISTS table_name (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'value'
                    CHECK (status IN ('a', 'b', 'c')),
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_column ON table_name(column);
```

**RLS policy pattern (from migration 042/044):**
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- DG: full access
CREATE POLICY prefix_dg_all ON table_name
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = (auth.jwt()->>'userId')::uuid AND role = 'dg')
  );

-- Agency staff: SELECT where agency matches
CREATE POLICY prefix_agency_select ON table_name
  FOR SELECT TO authenticated
  USING (
    agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
  );

-- For child tables (FK to parent): agency matches via JOIN
CREATE POLICY prefix_agency_select ON child_table
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parent_table p
      WHERE p.id = parent_id
        AND p.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );
```

**updated_at trigger pattern:**
```sql
CREATE OR REPLACE FUNCTION update_TABLE_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_TABLE_updated_at
  BEFORE UPDATE ON table_name
  FOR EACH ROW
  EXECUTE FUNCTION update_TABLE_updated_at();
```

## File upload patterns

**Storage bucket:** `application-documents` (Supabase Storage)
- Path format: `{agency}/{entity_id}/{file_name}`
- Upload via `supabaseAdmin.storage.from('bucket').upload(path, buffer)`
- Download URL: `supabaseAdmin.storage.from('bucket').getPublicUrl(path)`

**Upload UI:** `upload-zone` CSS class (dashed border, drag-over state with gold highlight)

**Document table pattern:**
```sql
id UUID PK, parent_id UUID FK CASCADE,
file_name TEXT, file_url TEXT, file_type TEXT, file_size BIGINT,
uploaded_by UUID FK users, uploaded_at TIMESTAMPTZ DEFAULT now()
```

## Pending Applications notes pattern

**Schema (migration 044 — `customer_application_notes`):**
```sql
CREATE TABLE IF NOT EXISTS customer_application_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES customer_applications(id) ON DELETE CASCADE,
  note_text       TEXT NOT NULL,
  status_at_time  TEXT,        -- stage at time of note
  new_status      TEXT,        -- if note accompanies a status change
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Key characteristics:**
- **Immutable** — no UPDATE or DELETE policies (logbook pattern)
- Indexes on `application_id` and `created_at DESC`
- RLS: DG full access, agency staff SELECT/INSERT where parent's agency matches
- Notes are separate from activity log (system-generated events)

## Projects table schema (for oversight_project_id FK)

**Table: `projects` (migration 004):**
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT UNIQUE NOT NULL,        -- e.g. "GPLXXX202601X27458"
  executing_agency TEXT,
  sub_agency TEXT,                         -- e.g. "GPL", "GWI"
  project_name TEXT,
  region TEXT,
  contract_value NUMERIC,
  contractor TEXT,
  project_end_date DATE,
  completion_pct NUMERIC DEFAULT 0,
  has_images INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Tabs component pattern

**`components/ui/Tabs.tsx`:**
```tsx
import { Tabs, type Tab } from '@/components/ui/Tabs';

const tabs: Tab[] = [
  { id: 'pipeline', label: 'Pipeline', icon: LayoutDashboard },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

<Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} compactOnMobile>
  {activeTab === 'pipeline' && <PipelineView />}
  {activeTab === 'timeline' && <TimelineView />}
</Tabs>
```
- Gold bottom border on active tab
- Arrow key navigation (a11y)
- Optional badge count per tab
- `compactOnMobile` hides labels, shows only icons on small screens

## CollapsibleSection pattern

```tsx
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';

<CollapsibleSection
  title="Submitted Packages"
  subtitle="4 packages"
  badge={{ text: '4', variant: 'gold' }}
  icon={Package}
  defaultOpen={true}
>
  {/* content */}
</CollapsibleSection>
```
- CSS grid collapse animation (`.collapse-grid`)
- Rounded border (`border border-navy-800 bg-navy-900/50`)
- ChevronDown rotates 180° when open
