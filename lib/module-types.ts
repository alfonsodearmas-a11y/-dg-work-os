/**
 * Shared module types — safe for both client and server imports.
 * Server-only logic lives in lib/modules/access.ts.
 */

export type AccessType = 'grant' | 'deny';

export interface ModuleRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  default_roles: string[];
  is_active: boolean;
  sort_order: number;
}

export interface ModuleOverride {
  slug: string;
  access_type: AccessType;
}
