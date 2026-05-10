import type { SchoolFeatureKey, SchoolFeatureToggles } from '@/lib/features/school-features';
import type { PermissionActionKey } from '@/lib/permissions/role-permissions';
import {
  withDefaultGovernanceVisibilitySettings,
  type GovernanceVisibilitySettings,
} from './governance-settings';

export type AccessModuleVisibility = {
  featureEnabled: boolean;
  canView: boolean;
  actions: Record<PermissionActionKey, boolean>;
};

export type AccessVisibilitySnapshot = {
  schoolId: string;
  role: string;
  features: SchoolFeatureToggles;
  governanceVisibility: GovernanceVisibilitySettings;
  modules: Record<SchoolFeatureKey, AccessModuleVisibility>;
  resources?: Record<string, Record<PermissionActionKey, boolean>>;
  temporaryGrantCount?: number;
  coreAccess?: Record<string, boolean>;
};

export function withDefaultAccessVisibility(
  snapshot: AccessVisibilitySnapshot | null | undefined,
): AccessVisibilitySnapshot | null {
  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    governanceVisibility: withDefaultGovernanceVisibilitySettings(
      snapshot.governanceVisibility,
    ),
  };
}

export function isModuleVisible(
  snapshot: AccessVisibilitySnapshot | null | undefined,
  module: SchoolFeatureKey,
) {
  if (!snapshot) {
    return true;
  }

  return snapshot.modules[module]?.canView !== false;
}
