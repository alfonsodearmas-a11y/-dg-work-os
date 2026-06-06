# Module Simplification Plan — Pure Role-Based Access + Title Removal + Agency-Save Bug

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make role (+ agency) the *only* determinant of what a user sees — remove the per-user module grant/deny system, remove the "Title (display only)" concept, and fix the User Details drawer agency-save bug.

**Architecture:** Replace DB-driven module resolution (`modules.default_roles` + `user_module_access` overrides, async, client-fetched) with a pure synchronous code map `modulesForUser(role, agency)`. The two-level role model (superadmin / agency_manager) is untouched. Destructive DB drops happen last, in a separately-approved migration after a soak.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (project `ozcdsnpieeetzzwjqvjo`), Zod, vitest.

**Status: AWAITING APPROVAL — nothing has been built.**

---

# Part I — Investigation Findings (verified against prod, 2026-06-06)

## 1. Blast radius: everything that reads `user_module_access`

### Server-side resolution (the only file with DB logic)
| File | What it does |
|---|---|
| `lib/modules/access.ts` (587 lines) | All resolution + mutation: `getUserModules`, `getUserModulePermissions`, `canAccessModule`, `canEditModule`, `grantModuleAccess`, `revokeModuleAccess`, `resetUserModuleOverrides`, `getUserModuleOverridesDetailed`, `bulkUpsertModulePermissions`, `getAllModules`, `requireModuleAccess` (defined, **zero callers**) |

Resolution order today: `superadmin` → bypass (all active modules) → per-user override (`deny` wins, then `grant` with `can_edit`) → fallback to `modules.default_roles`.

### API routes
| Route | Reads/writes |
|---|---|
| `app/api/modules/my-access/route.ts` GET | reads (feeds the client hook) |
| `app/api/admin/modules/route.ts` GET | reads `modules` table |
| `app/api/admin/modules/access/route.ts` GET/POST/DELETE | reads + writes overrides |
| `app/api/admin/modules/access/bulk/route.ts` POST | bulk-writes overrides |
| `app/api/admin/modules/access/reset/route.ts` POST | deletes overrides |
| `app/api/admin/users/route.ts` POST (invite) | writes overrides at invite time via `grantModuleAccess` / `bulkUpsertModulePermissions` (lines 147–159) |
| `app/api/applications/**` (5 route files, 9 call sites) | `canAccessModule(userId, role, 'applications')` — **the only server-side module enforcement in the entire app** |

### Client
| File | What it does |
|---|---|
| `hooks/useModuleAccess.ts` | fetches `/api/modules/my-access`; `canAccess()` is **optimistic-true while loading** |
| `components/layout/Sidebar.tsx:182-188` | filters nav items by `canAccess(item.moduleSlug)`; grid-health sub-item check at :334 |
| `components/layout/ModuleGate.tsx` | mounted once in `AppShell.tsx:116`; URL→slug map; redirects home on deny. `ModuleEditGate` is exported but **never used anywhere** |
| `app/airstrips/page.tsx` | `canEdit('airstrips')` gates edit controls — **the only `can_edit` consumer in the app** |
| `components/admin/UserDetailDrawer.tsx` | fetches modules + overrides on open; per-module toggle/bulk-preset handlers |
| `components/admin/UserRolesSection.tsx` (`ModuleAccessSection`, lines 116–287) | the grant/deny/edit toggle UI |
| `app/admin/people/page.tsx` (InviteModal, ~780–935) | per-module permission picker; sends `modulePermissions[]` / `moduleGrants[]` |
| `components/ui/CommandPalette.tsx` | static nav list incl. `/applications` — does **not** check access (ModuleGate catches on click) |

### DB objects
- `user_module_access` table + 2 RLS policies (`uma_superadmin_all`, `uma_self_select`) + 3 indexes — drop with table.
- `modules.default_roles` — read only inside `lib/modules/access.ts` (plus displayed as labels in `ModuleAccessSection`). Dies with the system.
- `role_permissions` / `core_permissions` / `roles` / `delegated_permissions` — a *separate, role-level* permission system used only by `lib/people-permissions.ts` `checkPermission()`, called from `/api/people/{access,activity,team-members,[id]}`. **Not per-user** (`delegated_permissions` would be, but has **0 rows** and no writers in code — dead). Can become a code map.
- `object_access_grants` / `object_ownership` — object *sharing* (dashboards/tasks), not role config. **Keep** (0 rows today, but it's the AccessControlPanel feature, orthogonal to this plan).

## 2. Prod override inventory — is any of it load-bearing?

**154 rows: 98 grants, 56 denies, across 14 of 24 users.** Full classification:

| Category | Rows | Verdict |
|---|---|---|
| Grants to **superadmins** (keisha ×19, indardeodat, par_sec, vambedkar) | 22 | **No-ops** — superadmin bypasses overrides entirely |
| Blanket grant sets duplicating role defaults (abraham ×17, rickford ×17, marissa ×17 *pending*, teamleaderpa ×17 *pending*, vashana ×4) | ~72 | **Redundant** — invite-time "View Only All" presets; same modules come from `default_roles` anyway |
| **Denies on 6 active agency_managers** — akeems ×12, alyken ×10, stephenthomas ×10, christopherv ×8, knandlall ×8, rghir ×8 | 56 | **Load-bearing today** — deliberately narrowed users. The target model removes these *by design* (they gain modules; detailed in Part III) |
| **`applications` grants** to knandlall (GPL) and markd (GWI) | 2 | **Load-bearing** — `applications` has `default_roles = []` so it is *only* reachable via grant. Plan folds `applications` into the agency_manager set so these two keep access (§Part II, D2) |
| `procurement` grants with `can_edit=true` (alyken, christopherv) | 2 | **Dormant** — `can_edit` is only consumed by the airstrips page; nothing in procurement checks it. No behavior to preserve |

**Bottom line:** the only override rows whose *removal* changes real behavior are the 56 denies (intentionally removed by the target model) and the 2 `applications` grants (preserved by design decision D2). Nothing else is relied upon.

## 3. Mission Control (slug `briefing`)

- Page: `app/page.tsx` → `components/today/TodayView.tsx`. Sidebar item `Sidebar.tsx:97`, no `requireRole`.
- Gating: module system only. `default_roles = ['superadmin','agency_manager']` in prod — **every agency_manager already has it by default**, but **5 active managers are currently hidden from it by deny rows** (akeems, alyken, christopherv, rghir, stephenthomas). Removing per-user access restores it for them — exactly the requirement.
- Agency scoping: **already done, role-aware, no work needed.** All data feeds scope via `scopedAgency(role, agency)` — `lib/today/signals.ts:88-90` (delayed projects, tender SLA, stagnant tenders, incomplete PSIP), `lib/today/sla-summary.ts:29-39`, `lib/today/top-tasks.ts:38-40` (`ilike('agency', agency)`); calendar is per-user; meeting actions are superadmin-only (`signals.ts:225` returns `[]` otherwise).

## 4. "Title (display only)" surfaces

| Surface | File:line |
|---|---|
| Drawer header badge `formal_title \|\| ROLE_LABELS[role]` | `components/admin/UserDetailDrawer.tsx:470` |
| Role badge + **title text input** | `components/admin/UserRolesSection.tsx:64, 68-87` |
| People list (mobile + desktop) | `app/admin/people/page.tsx:634, 640` |
| Invite modal "Title (display only)" input + payload | `app/admin/people/page.tsx:800, 943, 1030-1039` |
| Sidebar footer label `effectiveUser.title \|\| ROLE_LABELS[...]` | `components/layout/Sidebar.tsx:168` |
| Session: `SESSION_FIELDS` incl. `title`, `ProfileRow.formal_title`, mapping | `lib/auth-session.ts:16,26-27,43,84`; `lib/auth-supabase.ts:41` |
| ViewAs carries `title` | `components/providers/ViewAsProvider.tsx` (3 interfaces) |
| API: GET select / POST default+insert / PATCH schema+update+audit | `app/api/admin/users/route.ts:21,87,117`; `app/api/admin/users/[id]/route.ts:25,165-167,189,195,209` |
| NPTAB signature fallback | `app/api/nptab-reports/[id]/pdf/route.ts:22,27`; `.../submit/route.ts:37,42` |
| Constants + test | `lib/people-types.ts:114-121` (`TITLE_PRESETS`); `lib/__tests__/auth-contract.test.ts:23,38,47-56` |
| AppShell header | already uses `ROLE_LABELS` only — no change needed |

## 5. Agency-change bug — root cause (no data restore needed)

**Prod audit of all 18 agency_manager users: every one has a valid uppercase agency.** The four ex-officers specifically:

| User | Email | Prod `agency` |
|---|---|---|
| Christopher Vandeyar | christopherv@guyanawaterinc.com | **GWI** ✓ |
| Alicia Lyken | alyken@marad.gov.gy | **MARAD** ✓ |
| Vashana Lall | vashanalall@yahoo.com | **CJIA** ✓ |
| Test HECI Analyst | test.heci.analyst@mpua.gov.gy | **HECI** ✓ |

**Migration 128 is innocent:** its only `UPDATE public.users` sets `role` and never touches `agency` (and `users_agency_manager_agency_check` was added with plain `ADD CONSTRAINT`, which validates existing rows — it could not have committed if any agency_manager had NULL agency). **The suspected backfill is NOT needed.** Christopher's row is fine.

**Actual root cause — a casing mismatch, two symptoms, one constant:**

`components/admin/UserRolesSection.tsx:19-27` defines `AGENCY_OPTIONS` with **lowercase** values (`'gpl'`, `'gwi'`, …). But canonical storage is **uppercase** (migration 106; prod `users_agency_check` enforces `['GPL','GWI','CJIA','GCAA','MARAD','HECI','HAS']`), and the PATCH route's Zod enum (`app/api/admin/users/[id]/route.ts:23`) accepts only uppercase.

1. **Display symptom ("No agency"):** the drawer select binds `value={editAgency || ''}` = `'GWI'`, which matches *no* option, so the browser renders the first option — `<option value="">No agency</option>`. Christopher *looks* agency-less while his row says GWI.
2. **Save symptom (error):** picking "GWI" sends `agency: 'gwi'` → `parseBody` Zod → 400 `{code: 'VALIDATION_ERROR', errors: {...}}`. The drawer toast reads `data.error` (absent in that shape) → generic **"Failed to update"**.

Note: `app/admin/people/page.tsx:61` was already fixed to uppercase (comment cites migration 106) — `UserRolesSection` was missed.

**Latent second bug found while tracing:** the PATCH route validates "agency required for agency_manager" only when `role` is in the payload (`[id]/route.ts:174-183`). An agency-only update to `null` (possible today via the "No agency" option) bypasses the guard, hits the DB CHECK `users_agency_manager_agency_check`, and 500s. Fixed in Task 0.3.

---

# Part II — Target Design

## New resolution: one pure function, zero DB reads

**Create `lib/modules/role-modules.ts`** (client-safe, no imports from server code):

```ts
// Pure role-based module resolution. Role (+ agency) is the ONLY determinant.
// Replaces lib/modules/access.ts + the user_module_access / modules tables.
import { USER_AGENCIES, type UserAgency } from '@/lib/constants/agencies';

/** Modules every agency_manager gets; data inside each is agency-scoped by the data layer. */
const COMMON_MODULES = [
  'briefing',       // Mission Control — required for every agency_manager
  'agency-intel',
  'tasks',
  'oversight',
  'budget',
  'meetings',
  'calendar',
  'documents',
  'procurement',
  'applications',
] as const;

/** Agency-specific modules (deep dives + agency tools). */
const AGENCY_MODULES: Record<UserAgency, readonly string[]> = {
  GPL: ['gpl-deep-dive', 'grid-health'],
  GWI: ['gwi-deep-dive'],
  CJIA: ['cjia-deep-dive'],
  GCAA: ['gcaa-deep-dive'],
  HECI: ['heci-deep-dive'],
  MARAD: ['marad-deep-dive'],
  HAS: ['airstrips'],
};

/** Superadmin-only modules. */
const SUPERADMIN_MODULES = [
  'action-items',
  'nptab-reports',
  'minister-attention',
  'people',
  'settings',
] as const;

export const ALL_MODULES: readonly string[] = [
  ...COMMON_MODULES,
  ...Object.values(AGENCY_MODULES).flat(),
  ...SUPERADMIN_MODULES,
];

export function modulesForUser(
  role: string | null | undefined,
  agency: string | null | undefined,
): string[] {
  if (role === 'superadmin') return [...ALL_MODULES];
  if (role === 'agency_manager') {
    const key = (agency || '').toUpperCase() as UserAgency;
    return [...COMMON_MODULES, ...(AGENCY_MODULES[key] ?? [])];
  }
  return []; // 'system', unknown, or missing role → nothing
}

export function canAccessModule(
  role: string | null | undefined,
  agency: string | null | undefined,
  slug: string,
): boolean {
  return modulesForUser(role, agency).includes(slug);
}

/** Edit follows access — role is the only determinant; per-user can_edit is gone. */
export const canEditModule = canAccessModule;
```

`useModuleAccess` becomes a synchronous wrapper over `useEffectiveUser()` (same return shape — `Sidebar`, `ModuleGate`, airstrips page need no signature changes). Side benefits: the optimistic-allow-while-loading hole disappears, there is no fetch, and **View As now previews module visibility correctly** (today the hook uses the real session, so View As never changed the sidebar).

## Decisions (locked — no "confirm during implementation")

- **D1 — Deep dives tighten to own agency.** Today `default_roles` gives every agency_manager *all seven* deep dives (the sidebar hides others, but direct URLs like `/intel/gpl` pass ModuleGate). New model: own agency only. This is the "scoped to their own agency" requirement applied to routes, not just nav.
- **D2 — `applications` joins COMMON_MODULES.** It has `default_roles=[]` today and *only* worked via per-user grant (knandlall/GPL, markd/GWI). Its list API already agency-scopes non-superadmins (`app/api/applications/route.ts:34-39`), so giving it to all agency managers is safe — MARAD/HECI/HAS managers just see an empty list (the new-application form only offers GPL/GWI/CJIA/GCAA). This preserves the two real users and un-strands the module. It stays out of the sidebar (reachable via Command Palette, as today).
- **D3 — `can_edit` concept is deleted; edit = access.** The only consumer is the airstrips page edit controls. Consequence: HAS managers (abraham, akeems) gain airstrips *edit* (today view-only). The two dormant procurement `can_edit=true` rows had no effect and lose nothing. `ModuleEditGate` (zero usages) is deleted.
- **D4 — `grid-health` is GPL-specific** (it's "GPL Grid Health"; the sidebar already nests it under GPL). Non-GPL managers lose nominal (sidebar-hidden) access.
- **D5 — `roles`/`role_permissions`/`core_permissions`/`delegated_permissions` become a code map and are dropped in cleanup.** `checkPermission()` keeps its signature but resolves from a constant (superadmin = all 31 permissions — verified exact against prod; agency_manager = the 19 rows in prod, transcribed in Task 1.7). `delegated_permissions` has 0 rows + no writers. `/api/people/permissions` has no client callers → deleted. `canManageUser()` is already pure code → untouched. Object sharing (`object_access_grants`, `object_ownership`, AccessControlPanel) is **kept** — it's content sharing, not role config.
- **D6 — `formal_title` column: recommend DROP** in the Phase 4 cleanup migration (alongside the already-flagged soak items). Until then the column simply stops being read/written. NPTAB report signature (the only functional read) becomes a hardcoded constant — those reports are superadmin-generated ministry documents signed by the DG; today's code already falls back to exactly that string.
- **D7 — `modules` table: DROP** in Phase 4. Once resolution is code, nothing reads it (Sidebar/ModuleGate/CommandPalette already hardcode slugs, names, icons).
- **D8 — Invites become role + agency only.** The invite modal's per-module picker and the `modulePermissions`/`moduleGrants` body fields are removed.

## What gets removed / simplified / kept

| Object | Fate |
|---|---|
| `user_module_access` table (+RLS, indexes) | **DROP** (Phase 4, destructive — approval gate) |
| `modules` table (incl. `default_roles`) | **DROP** (Phase 4) |
| `roles`, `role_permissions`, `core_permissions`, `delegated_permissions` | **DROP** (Phase 4) — replaced by code map (D5) |
| `users.formal_title` | **DROP COLUMN** (Phase 4, D6) |
| `lib/modules/access.ts` | **DELETE** (Phase 1) → replaced by `lib/modules/role-modules.ts` |
| `/api/modules/my-access`, `/api/admin/modules`, `/api/admin/modules/access{,/bulk,/reset}` | **DELETE** (Phase 1) |
| `ModuleAccessSection`, drawer module toggles, invite module picker | **DELETE** (Phase 1) |
| `hooks/useModuleAccess.ts` | **REWRITE** to pure sync (Phase 1) |
| `ModuleGate` + URL map, Sidebar nav arrays | **KEEP** (consume the pure hook) |
| `object_access_grants`, `object_ownership`, `activity_logs`, AccessControlPanel | **KEEP** |
| Mission Control scoping (`lib/today/*`) | **KEEP** — already role+agency scoped |

---

# Part III — Honest blast radius (behavior changes, per user)

**Gains (deny rows removed — intended):**

| Active user (agency) | Modules they will start seeing |
|---|---|
| akeems (HAS) | Mission Control, Budget, Calendar, Documents, Meetings, Oversight (+Applications via D2) |
| alyken (MARAD) | Mission Control, Agency Intel, Budget, Calendar, Documents, Meetings (+Applications) |
| stephenthomas (MARAD) | Mission Control, Budget, Calendar, Documents, Meetings, Oversight (+Applications) |
| christopherv (GWI) | Mission Control, Agency Intel, Calendar, Documents, Meetings (+Applications) |
| knandlall (GPL) | Agency Intel, Calendar, Documents, Meetings, Oversight (keeps Applications) |
| rghir (CJIA) | Mission Control, Calendar, Documents, Meetings, Oversight (+Applications) |
| **all** agency managers | Applications (empty list for MARAD/HECI/HAS) |
| HAS managers (abraham, akeems) | airstrips **edit** controls (D3) |

**Losses / tightenings:**
- All agency managers lose direct-URL access to *other agencies'* deep dives (D1) and non-GPL managers lose nominal grid-health access (D4). Nav never showed these; only bookmarks/URLs are affected.
- The DG loses the ability to narrow or extend any individual user — that is the point of this change, but note the 56 deny rows were *deliberately* configured at some point. After Phase 4 the only lever left is role + agency.
- Invite-time module customization disappears (D8).
- `/api/people/permissions` route deleted (no callers).

**Not affected:** superadmins (bypass before and after); pending/inactive users (marissa, teamleaderpa, indardeodat — their override rows are inert); the `system` user (resolves to no modules, same as today — it's an API-only identity); NPTAB/Minister-attention (`requireRole` superadmin checks in Sidebar stay).

**Net Mission Control check:** every active agency_manager sees it, agency-scoped, with zero scoping code changes. ✓

---

# Part IV — Implementation Tasks

Run `npm test` (vitest), `npx tsc --noEmit`, `npm run build` as indicated. Work on a feature branch off `main` (e.g. `feature/module-simplification`).

## Phase 0 — Agency-save bug fix (independent; ship first)

### Task 0.1: Canonical agency constant

**Files:** Modify `lib/constants/agencies.ts`

- [ ] **Step 1:** Add below `AGENCY_CODES`:

```ts
/** Canonical users.agency values — mirrors the users_agency_check DB constraint exactly. */
export const USER_AGENCIES = ['GPL', 'GWI', 'CJIA', 'GCAA', 'HECI', 'MARAD', 'HAS'] as const;
export type UserAgency = (typeof USER_AGENCIES)[number];
```

- [ ] **Step 2:** `npx tsc --noEmit` → clean. Commit: `feat(admin): canonical USER_AGENCIES constant matching users_agency_check`

### Task 0.2: Fix the drawer's agency select

**Files:** Modify `components/admin/UserRolesSection.tsx:19-27, 88-106`; Modify `components/admin/UserDetailDrawer.tsx` (saveChanges, ~308-337)

- [ ] **Step 1:** Replace the lowercase `AGENCY_OPTIONS` const (lines 19-27) with:

```ts
import { USER_AGENCIES } from '@/lib/constants/agencies';

const AGENCY_OPTIONS = USER_AGENCIES.map(a => ({ value: a, label: a }));
```

- [ ] **Step 2:** In the agency `<select>` (lines 90-100), remove `<option value="">No agency</option>` and add a disabled placeholder shown only when unset:

```tsx
<select
  value={editAgency || ''}
  onChange={e => onFieldChange('agency', e.target.value || null)}
  aria-label="User agency"
  className="w-full px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
>
  {!editAgency && <option value="" disabled>Select agency…</option>}
  {AGENCY_OPTIONS.map(a => (
    <option key={a.value} value={a.value}>{a.label}</option>
  ))}
</select>
```

- [ ] **Step 3:** In `UserDetailDrawer.tsx` `saveChanges`, add a client guard before building the payload:

```ts
if (editRole === 'agency_manager' && !editAgency) {
  showToast('Select an agency — agency managers must belong to one', 'error');
  setSaving(false);
  return;
}
```

- [ ] **Step 4:** Improve the error toast (same function) so `VALIDATION_ERROR` responses aren't swallowed:

```ts
const msg =
  data.error ||
  data.message ||
  (data.errors ? (Object.values(data.errors as Record<string, string[]>).flat()[0] ?? null) : null) ||
  'Failed to update';
showToast(msg, 'error');
```

- [ ] **Step 5:** `npx tsc --noEmit` → clean. Commit: `fix(admin): drawer agency select uses canonical uppercase values; require agency for agency managers`

### Task 0.3: Server-side guard for agency-clearing (TDD)

**Files:** Create `lib/admin/validate-user-patch.ts`; Test `lib/admin/__tests__/validate-user-patch.test.ts`; Modify `app/api/admin/users/[id]/route.ts`

- [ ] **Step 1: Write the failing test** `lib/admin/__tests__/validate-user-patch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { agencyPatchError } from '@/lib/admin/validate-user-patch';

describe('agencyPatchError', () => {
  const existing = { role: 'agency_manager', agency: 'GWI' };

  it('allows changing agency to a valid value', () => {
    expect(agencyPatchError(existing, { agency: 'GPL' })).toBeNull();
  });
  it('rejects clearing agency for an agency manager (agency-only patch)', () => {
    expect(agencyPatchError(existing, { agency: null })).toMatch(/required/i);
  });
  it('rejects role→agency_manager when neither patch nor row has agency', () => {
    expect(agencyPatchError({ role: 'superadmin', agency: null }, { role: 'agency_manager' })).toMatch(/required/i);
  });
  it('allows role→agency_manager when patch supplies agency', () => {
    expect(agencyPatchError({ role: 'superadmin', agency: null }, { role: 'agency_manager', agency: 'CJIA' })).toBeNull();
  });
  it('allows superadmin with null agency', () => {
    expect(agencyPatchError(existing, { role: 'superadmin', agency: null })).toBeNull();
  });
  it('allows patches that do not touch role or agency', () => {
    expect(agencyPatchError(existing, { name: 'X' })).toBeNull();
  });
});
```

- [ ] **Step 2:** `npm test -- validate-user-patch` → FAIL (module not found).
- [ ] **Step 3:** Implement `lib/admin/validate-user-patch.ts`:

```ts
/** Mirrors the users_agency_manager_agency_check DB constraint at the API layer. */
export function agencyPatchError(
  existing: { role: string; agency: string | null },
  patch: { role?: string; agency?: string | null; name?: string },
): string | null {
  const effectiveRole = patch.role ?? existing.role;
  const effectiveAgency = patch.agency !== undefined ? patch.agency : existing.agency;
  if (effectiveRole === 'agency_manager' && !effectiveAgency) {
    return 'Agency is required for the agency manager role';
  }
  return null;
}
```

- [ ] **Step 4:** `npm test -- validate-user-patch` → PASS.
- [ ] **Step 5:** In `app/api/admin/users/[id]/route.ts`: replace the role-conditional guard (lines 174-183) — fetch the existing row once (`role, agency`), then:

```ts
const agencyError = agencyPatchError(existingUser, data!);
if (agencyError) return NextResponse.json({ error: agencyError }, { status: 400 });
if (data!.role === 'superadmin') updates.agency = null; // superadmins are agency-less
```

Also swap the Zod agency enum to the shared constant: `agency: z.enum(USER_AGENCIES).nullable().optional()`, and in `app/api/admin/users/route.ts` replace local `VALID_AGENCIES` with `USER_AGENCIES`.

- [ ] **Step 6:** `npm test && npx tsc --noEmit` → clean. Commit: `fix(admin): enforce agency-required for agency managers on every PATCH shape`

## Phase 1 — Pure role-based module resolution (code-only; DB untouched)

### Task 1.1: `role-modules.ts` (TDD)

**Files:** Create `lib/modules/role-modules.ts` (code in Part II); Test `lib/modules/__tests__/role-modules.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, it, expect } from 'vitest';
import { modulesForUser, canAccessModule, canEditModule, ALL_MODULES } from '@/lib/modules/role-modules';

describe('modulesForUser', () => {
  it('superadmin gets every module', () => {
    expect(modulesForUser('superadmin', null)).toEqual([...ALL_MODULES]);
  });
  it('agency_manager gets common modules incl. Mission Control + own deep dive only', () => {
    const m = modulesForUser('agency_manager', 'GWI');
    expect(m).toContain('briefing');
    expect(m).toContain('applications');
    expect(m).toContain('gwi-deep-dive');
    expect(m).not.toContain('gpl-deep-dive');
    expect(m).not.toContain('people');
    expect(m).not.toContain('settings');
    expect(m).not.toContain('action-items');
  });
  it('grid-health is GPL-only; airstrips is HAS-only', () => {
    expect(canAccessModule('agency_manager', 'GPL', 'grid-health')).toBe(true);
    expect(canAccessModule('agency_manager', 'GWI', 'grid-health')).toBe(false);
    expect(canAccessModule('agency_manager', 'HAS', 'airstrips')).toBe(true);
    expect(canAccessModule('agency_manager', 'MARAD', 'airstrips')).toBe(false);
  });
  it('tolerates lowercase/legacy agency casing', () => {
    expect(canAccessModule('agency_manager', 'gwi', 'gwi-deep-dive')).toBe(true);
  });
  it('system/unknown roles get nothing', () => {
    expect(modulesForUser('system', null)).toEqual([]);
    expect(modulesForUser(null, 'GPL')).toEqual([]);
  });
  it('edit follows access', () => {
    expect(canEditModule('agency_manager', 'HAS', 'airstrips')).toBe(true);
    expect(canEditModule('agency_manager', 'GWI', 'airstrips')).toBe(false);
  });
});
```

- [ ] **Step 2:** `npm test -- role-modules` → FAIL. **Step 3:** Implement (Part II code, importing `USER_AGENCIES` from Task 0.1). **Step 4:** PASS. **Step 5:** Commit: `feat(modules): pure role-based module resolution`

### Task 1.2: Rewrite `hooks/useModuleAccess.ts`

**Files:** Rewrite `hooks/useModuleAccess.ts` (same return shape)

- [ ] **Step 1:**

```ts
'use client';

import { useCallback, useMemo } from 'react';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { modulesForUser } from '@/lib/modules/role-modules';

/** Pure role-based module access. Synchronous — no fetch, no loading state. */
export function useModuleAccess() {
  const { effectiveUser } = useEffectiveUser();
  const modules = useMemo(
    () => modulesForUser(effectiveUser.role, effectiveUser.agency),
    [effectiveUser.role, effectiveUser.agency],
  );
  const canAccess = useCallback((slug: string) => modules.includes(slug), [modules]);
  const permissions = useMemo(
    () => Object.fromEntries(modules.map(s => [s, { canView: true, canEdit: true }])),
    [modules],
  );
  return { modules, permissions, loading: false, canAccess, canEdit: canAccess, refresh: () => {} };
}
```

- [ ] **Step 2:** In `components/layout/ModuleGate.tsx`: delete the unused `ModuleEditGate` export; remove now-dead `loading` branches (hook always returns `loading: false`). Sidebar and airstrips page need no changes (same hook API).
- [ ] **Step 3:** `npx tsc --noEmit && npm run build` → clean. Commit: `feat(modules): useModuleAccess is pure + View As aware; drop unused ModuleEditGate`

### Task 1.3: Server enforcement on applications routes

**Files:** Modify `app/api/applications/route.ts`, `[id]/route.ts`, `[id]/notes/route.ts`, `[id]/documents/route.ts`, `[id]/documents/[docId]/route.ts` (9 call sites)

- [ ] **Step 1:** In each file replace `import { canAccessModule } from '@/lib/modules/access'` with `from '@/lib/modules/role-modules'`, and each call:

```ts
const hasAccess = canAccessModule(session.user.role, session.user.agency, 'applications'); // no await
```

- [ ] **Step 2:** `npx tsc --noEmit` → clean. Commit: `feat(applications): role-based access check (applications now a standard agency module)`

### Task 1.4: Remove per-user access admin UI

**Files:** Modify `components/admin/UserRolesSection.tsx` (delete `ModuleAccessSection` + its types/props, lines 114-287); Modify `components/admin/UserDetailDrawer.tsx` (remove modules/access fetches at 103-126, toggle handlers 128-233, the `ModuleAccessSection` render block, related state); Modify `app/admin/people/page.tsx` (InviteModal: delete `InviteModulePermission` interface ~780, `modulePerms` state ~812-930, picker UI, and `modulePermissions`/`moduleGrants` from the POST payload)

- [ ] **Step 1:** Make the edits above; also delete `lib/module-types.ts` types that no longer have consumers (`ModuleRecord`, `ModuleOverride`, `ModuleOverrideDetailed`, `ModulePermission`) — delete the file if empty.
- [ ] **Step 2:** `npx tsc --noEmit && npm run build` → clean. Commit: `feat(admin): remove per-user module access UI — role+agency is the only lever`

### Task 1.5: Delete module-access APIs + resolution lib

**Files:** Delete `app/api/modules/my-access/route.ts`, `app/api/admin/modules/route.ts`, `app/api/admin/modules/access/route.ts`, `app/api/admin/modules/access/bulk/route.ts`, `app/api/admin/modules/access/reset/route.ts`, `lib/modules/access.ts`; Modify `app/api/admin/users/route.ts` (drop the `grantModuleAccess`/`bulkUpsertModulePermissions` import and lines 147-159)

- [ ] **Step 1:** Delete/edit as above.
- [ ] **Step 2:** `grep -rn "modules/access\|user_module_access\|my-access\|admin/modules" app lib components hooks --include="*.ts" --include="*.tsx"` → only migration files match.
- [ ] **Step 3:** `npx tsc --noEmit && npm run build && npm test` → clean. Commit: `feat(modules): delete user_module_access read/write paths`

### Task 1.6: Command Palette respects access

**Files:** Modify `components/ui/CommandPalette.tsx`

- [ ] **Step 1:** Add `moduleSlug` to each navigation item (`/` → `briefing`, `/applications` → `applications`, etc., matching `ModuleGate`'s map), then filter: `items.filter(i => !i.moduleSlug || canAccess(i.moduleSlug))` using `useModuleAccess()`.
- [ ] **Step 2:** `npx tsc --noEmit` → clean. Commit: `feat(nav): command palette hides inaccessible modules`

### Task 1.7: `checkPermission` → code map (D5)

**Files:** Modify `lib/people-permissions.ts`; Delete `app/api/people/permissions/route.ts`; Test `lib/__tests__/people-permissions.test.ts`

- [ ] **Step 1: Failing test:**

```ts
import { describe, it, expect } from 'vitest';
import { roleHasPermission } from '@/lib/people-permissions';

describe('roleHasPermission', () => {
  it('superadmin has everything', () => {
    expect(roleHasPermission('superadmin', 'user.manage_roles')).toBe(true);
    expect(roleHasPermission('superadmin', 'audit.read')).toBe(true);
  });
  it('agency_manager has its fixed set and nothing more', () => {
    expect(roleHasPermission('agency_manager', 'task.create')).toBe(true);
    expect(roleHasPermission('agency_manager', 'user.invite')).toBe(true);
    expect(roleHasPermission('agency_manager', 'audit.read')).toBe(false);
    expect(roleHasPermission('agency_manager', 'user.manage_roles')).toBe(false);
  });
  it('unknown roles have nothing', () => {
    expect(roleHasPermission('system', 'task.read')).toBe(false);
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:** In `lib/people-permissions.ts` add the map (transcribed 1:1 from prod `role_permissions` on 2026-06-06) and rewrite `checkPermission`:

```ts
/** Transcribed from prod role_permissions (2026-06-06). superadmin = all permissions. */
const AGENCY_MANAGER_PERMISSIONS = new Set([
  'agency.manage', 'agency.read',
  'dashboard.create', 'dashboard.edit', 'dashboard.export', 'dashboard.read', 'dashboard.share',
  'report.create', 'report.edit', 'report.export', 'report.read', 'report.share',
  'task.create', 'task.delete', 'task.edit', 'task.read', 'task.share',
  'user.invite', 'user.read',
]);

export function roleHasPermission(role: string, permissionName: string): boolean {
  if (role === 'superadmin') return true;
  if (role === 'agency_manager') return AGENCY_MANAGER_PERMISSIONS.has(permissionName);
  return false;
}

export async function checkPermission(userId: string, permissionName: string): Promise<boolean> {
  const { data: user } = await supabaseAdmin.from('users').select('role').eq('id', userId).single();
  if (!user) return false;
  return roleHasPermission(user.role, permissionName);
}
```

Delete `getPermissionsForRole`, `getRolesWithPermissions`, `getAllPermissions`, the delegated-permissions branch/functions, and `app/api/people/permissions/route.ts` (no client callers — verified). Keep `canManageUser`, `logActivity`, and all object-access functions.

- [ ] **Step 4:** `npm test && npx tsc --noEmit` → PASS/clean. Commit: `feat(roles): role permissions resolved from code, not role_permissions table`

## Phase 2 — Title removal (code-only)

### Task 2.1: Strip `formal_title` from UI

**Files:** Modify `components/admin/UserRolesSection.tsx` (delete the entire "Title (display only)" `Field` 68-87 + `editTitle` prop + `TITLE_PRESETS` import; role badge at :64 → `ROLE_LABELS[user.role] ?? user.role`); `components/admin/UserDetailDrawer.tsx` (drop `editTitle` state/payload/handler; header :470 → `ROLE_LABELS[user.role] ?? user.role`; remove `formal_title` from its `User` type); `app/admin/people/page.tsx` (displays :634/:640 → `ROLE_LABELS[u.role] ?? u.role`; InviteModal: delete title state :800, input :1030-1039, payload :943; remove `formal_title` from the page's `User` type); `components/layout/Sidebar.tsx:168` → `const roleLabel = ROLE_LABELS[userRole as keyof typeof ROLE_LABELS] || userRole;`; `components/providers/ViewAsProvider.tsx` (remove `title` from `ViewAsTarget`/`EffectiveUser` and both `useMemo` blocks); `lib/people-types.ts` (delete `TITLE_PRESETS`; remove `formal_title` from `TeamMember`)

- [ ] **Step 1:** Make the edits. **Step 2:** `npx tsc --noEmit && npm run build` → clean (compiler finds any missed consumer). Commit: `feat(people): remove Title (display only) — role label is the only descriptor`

### Task 2.2: Strip `formal_title` from APIs + session

**Files:** Modify `app/api/admin/users/route.ts` (GET select :21 drop `formal_title`; POST: remove from schema, drop `formalTitle` default :87 and insert :117); `app/api/admin/users/[id]/route.ts` (schema :25, update :165-167, selects :189/:195, audit :209); `lib/auth-session.ts` (remove `'title'`… wait — remove `formal_title` from `SESSION_FIELDS` :16, the `title` property :26-27, `ProfileRow.formal_title` :43, mapping :84); `lib/auth-supabase.ts:41` (drop `formal_title` from select); `app/api/nptab-reports/[id]/pdf/route.ts` + `submit/route.ts` (select `'name'` only; replace fallback expression with the constant below); Test `lib/__tests__/auth-contract.test.ts` (drop title fixtures/assertions :23/:38/:47-56)

```ts
const NPTAB_SIGNATURE_TITLE = 'Director General, Ministry of Public Utilities and Aviation';
```

- [ ] **Step 1:** Make the edits. **Step 2:** `npm test && npx tsc --noEmit && npm run build` → clean. Commit: `feat(auth): drop formal_title from session and admin APIs`

## Phase 3 — Deploy + prod verification

- [ ] **Step 1:** Full local gate: `npm test && npx tsc --noEmit && npm run build`.
- [ ] **Step 2:** PR → review → merge → `vercel --prod` (auto-aliases dashboard.mpua.gov.gy).
- [ ] **Step 3:** Prod smoke (Playwright MCP):
  - `test.gpl.manager@mpua.gov.gy`: sidebar = Mission Control, Agency Intel, Tasks, Oversight, Budget, Meetings, Calendar, Documents, Procurement + GPL agency section (with Grid Health); **no** Admin section, no other agencies. Mission Control shows GPL-scoped signals. Direct `/intel/gwi` → redirected home. `/applications` loads (GPL-scoped).
  - `test.heci.analyst@mpua.gov.gy` (ex-officer): same common set + HECI deep dive; Mission Control visible (deny rows now inert — code no longer reads them).
  - Owner account: People drawer for Christopher Vandeyar shows **Agency: GWI** (display bug gone); change a *test* user's agency GPL→GWI→GPL: both saves succeed; attempt is blocked client-side if agency cleared.
  - Airstrips page as HAS manager: edit controls visible.
- [ ] **Step 4:** Soak 3–7 days (overrides are inert but still in the DB — instant rollback = redeploy previous build).

## Phase 4 — DB cleanup ⚠️ DESTRUCTIVE — STOP: requires explicit approval before running

**Migration `supabase/migrations/129_module_simplification_cleanup.sql`** (do NOT run without sign-off; every statement below is flagged destructive per migration policy):

```sql
-- 129_module_simplification_cleanup.sql
-- Pre-drop snapshots (kept until post-soak cleanup, mirroring 128's _role_migration_backup pattern)
CREATE TABLE public._module_access_backup_129 AS
  SELECT u.email, m.slug, uma.access_type, uma.can_edit, uma.agency, uma.granted_at
  FROM public.user_module_access uma
  JOIN public.users u ON u.id = uma.user_id
  JOIN public.modules m ON m.id = uma.module_id;
CREATE TABLE public._modules_backup_129 AS SELECT * FROM public.modules;

-- Per-user module configurability — gone (RLS policies + indexes drop with the tables)
DROP TABLE public.user_module_access;
DROP TABLE public.modules;

-- Role→permission config now lives in code (lib/people-permissions.ts)
DROP TABLE public.delegated_permissions;   -- 0 rows, no writers
DROP TABLE public.role_permissions;
DROP TABLE public.core_permissions;
DROP TABLE public.roles;

-- Title concept removed (D6)
ALTER TABLE public.users DROP COLUMN formal_title;
```

Optionally fold in the already-flagged role-simplification soak items (decide at approval time): `DROP COLUMN users.password_hash`, `DROP TABLE public._role_migration_backup`, `DROP CONSTRAINT users_agency_values`.

**Branch rehearsal (before prod):** `create_branch` (replays the reconciled prod ledger → zero-diff schema) → `apply_migration` 129 on the branch → verify it applies cleanly (catches FK/dependency-order surprises, e.g. any unknown FK into `core_permissions`) → `list_tables` to confirm the six tables + column are gone and `_*_backup_129` exist → delete branch. Also re-run the Task 1.5 grep to prove zero code references before dropping.

**Rollback:** Phase 0–2 are redeploys of the previous build (DB untouched). Phase 4: restore from `_module_access_backup_129` / `_modules_backup_129` + revert the code deploy.

---

# Part V — Self-review notes

- Spec coverage: blast radius (§I.1–2) ✓; override audit + load-bearing verdict (§I.2) ✓; resolution flow + replacement (§I.1, II) ✓; Sidebar/useModuleAccess/Mission Control (§II, Tasks 1.1–1.2, §I.3 — no scoping work needed) ✓; DB objects removed/simplified/kept incl. `role_permissions` (§II table, D5) ✓; title plan + column recommendation (§I.4, D6, Tasks 2.1–2.2) ✓; agency bug root cause + per-user audit + fix (§I.5, Phase 0) — **backfill not needed, contrary to the initial suspicion; no data writes in the fix** ✓; phased sequence with destructive-op stop + branch rehearsal (Phase 4) ✓; `applications` strand-risk surfaced and resolved (D2) ✓.
- Known judgment calls the reviewer may want to overrule: D2 (applications → all agency managers vs superadmin-only), D3 (HAS managers gain airstrips edit), the 56 deny rows being intentionally vaporized (§III), and whether to fold the old soak items into migration 129.
