# Auth Migration Checklist: `auth()` -> `requireRole()`

Files that call `auth()` directly without using `requireRole()` for role-based access control.
Each file should be migrated to use `requireRole()` from `@/lib/auth-helpers` instead of raw `auth()` from `@/lib/auth`.

## Pages (`app/`)

- [ ] `app/page.tsx` — Home page. Calls `auth()` and redirects to `/login` if no session. Should use `requireRole()` with appropriate roles.
- [ ] `app/intel/pending-applications/page.tsx` — Pending applications page. Calls `auth()` to read role/agency. No authentication gate (renders even without session).

## API: AI (`app/api/ai/`)

- [ ] `app/api/ai/action/route.ts` — AI action execution (POST). Calls `auth()` and checks `session?.user?.id` manually.

## API: Applications (`app/api/applications/`)

- [ ] `app/api/applications/route.ts` — List/create applications (GET/POST). Uses `auth()` + `canAccessModule()` but no `requireRole()`.
- [ ] `app/api/applications/[id]/route.ts` — Single application (GET/PATCH). Uses `auth()` + `canAccessModule()` but no `requireRole()`.
- [ ] `app/api/applications/[id]/documents/route.ts` — Upload document (POST). Uses `auth()` + `canAccessModule()` but no `requireRole()`.
- [ ] `app/api/applications/[id]/documents/[docId]/route.ts` — Delete document (DELETE). Uses `auth()` + `canAccessModule()` but no `requireRole()`.

## API: Briefing (`app/api/briefing/`)

- [ ] `app/api/briefing/route.ts` — Daily briefing (GET). Calls `auth()` and checks `session?.user?.id` manually.

## API: GPL Forecast (`app/api/gpl/forecast/`)

- [ ] `app/api/gpl/forecast/refresh/route.ts` — Refresh forecasts (POST). Calls `auth()` but falls back to `'system'` if no session — no auth gate.
- [ ] `app/api/gpl/forecast/multivariate/route.ts` — Multivariate forecast (POST). Calls `auth()` but falls back to `'system'` if no session — no auth gate.

## API: Documents Sync (`app/api/documents/sync/`)

- [ ] `app/api/documents/sync/drive/route.ts` — Drive sync POST/GET. Uses `requireRole()` but also calls redundant `auth()` for session.
- [ ] `app/api/documents/sync/drive/folders/route.ts` — Drive folders GET/POST. Uses `requireRole()` but also calls redundant `auth()` for session.

## API: Integrations (`app/api/integrations/`)

- [ ] `app/api/integrations/google/callback/route.ts` — Google OAuth callback (GET). Calls `auth()` for user ID during token exchange.
- [ ] `app/api/integrations/google/disconnect/route.ts` — Disconnect Google (POST). Calls `auth()` and checks `session?.user?.id` manually.
- [ ] `app/api/integrations/google/status/route.ts` — Google connection status (GET). Calls `auth()` and checks `session?.user?.id` manually.

## API: Metrics (`app/api/metrics/`)

- [ ] `app/api/metrics/[agency]/[id]/route.ts` — Approve/reject metrics (PATCH). Calls `auth()` but falls back to `'system'` — no auth gate.

## API: Modules (`app/api/modules/`)

- [ ] `app/api/modules/my-access/route.ts` — User module access (GET). Calls `auth()` and checks `session?.user?.id` manually.

## API: Notifications (`app/api/notifications/`)

- [ ] `app/api/notifications/route.ts` — List/update notifications (GET/PATCH). Calls `auth()` and checks `session?.user?.id` manually.
- [ ] `app/api/notifications/generate/route.ts` — Generate notifications (GET/POST). Calls `auth()` with dual cron/session auth pattern.
- [ ] `app/api/notifications/preferences/route.ts` — Notification preferences (GET/PUT). Calls `auth()` and checks `session?.user?.id` manually.

## API: Pending Applications Upload (`app/api/pending-applications/`)

- [ ] `app/api/pending-applications/upload/route.ts` — Upload pending applications (POST). Calls `auth()` inside `validateAuth()` with dual auth pattern (session + upload-auth cookie).

## API: Push Notifications (`app/api/push/`)

- [ ] `app/api/push/log/route.ts` — SW logging (POST/GET). Calls `auth()` but falls back to `user_id` from body or `'system'` — no auth gate.
- [ ] `app/api/push/subscribe/route.ts` — Push subscribe/list/unsubscribe (POST/GET/DELETE). Calls `auth()` but falls back to `user_id` from body — partial auth gate.

## API: Upload (`app/api/upload/`)

- [ ] `app/api/upload/daily/confirm/route.ts` — Confirm daily upload (POST). Calls `auth()` but falls back to `'system'` — no auth gate.

## Library (`lib/`)

- [ ] `lib/modules/access.ts` — `requireModuleAccess()` function. Calls `auth()` internally to check module access, but does not use `requireRole()`.

---

## Notes

- **Dual-auth routes** (cron + session, or upload-auth + session): These may need special handling. Consider keeping `auth()` for the session check but adding `requireRole()` where appropriate.
- **Fallback to `'system'`**: Several routes fall back to `userId = 'system'` when no session is found, effectively allowing unauthenticated access. These are the highest priority for migration.
- **`canAccessModule()` pattern**: The applications routes use `canAccessModule()` from `lib/modules/access.ts` for authorization, which is a form of access control but bypasses the standard `requireRole()` pattern. Consider whether these should also use `requireRole()` or if `canAccessModule()` is sufficient.

## Migration Pattern

```typescript
// Before (direct auth())
const session = await auth();
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

// After (requireRole())
import { requireRole } from '@/lib/auth-helpers';

const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
if (authResult instanceof NextResponse) return authResult;
const { session } = authResult;
```
