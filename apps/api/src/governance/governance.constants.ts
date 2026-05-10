import { GovernanceSettingKey, UserRole } from '@prisma/client';
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type PermissionActionKey,
  type PermissionResourceKey,
} from '../role-permissions/role-permissions.constants';
import type { FeatureModuleKey } from '../feature-toggles/feature-toggles.constants';

export const GOVERNANCE_SETTING_KEYS = [
  GovernanceSettingKey.PARENT_CAN_VIEW_GRADES,
  GovernanceSettingKey.PARENT_CAN_VIEW_ATTENDANCE,
  GovernanceSettingKey.STUDENT_CAN_VIEW_GRADES,
  GovernanceSettingKey.STUDENT_CAN_VIEW_ATTENDANCE,
] as const;

export type GovernanceSettingKeyName = (typeof GOVERNANCE_SETTING_KEYS)[number];

export type GovernanceVisibilitySettings = Record<GovernanceSettingKeyName, boolean>;

export const GOVERNANCE_DEFAULT_VISIBILITY_SETTINGS: GovernanceVisibilitySettings = {
  [GovernanceSettingKey.PARENT_CAN_VIEW_GRADES]: true,
  [GovernanceSettingKey.PARENT_CAN_VIEW_ATTENDANCE]: true,
  [GovernanceSettingKey.STUDENT_CAN_VIEW_GRADES]: true,
  [GovernanceSettingKey.STUDENT_CAN_VIEW_ATTENDANCE]: true,
};

export const GOVERNANCE_CORE_RESOURCES: Array<{
  resource: PermissionResourceKey;
  action: PermissionActionKey;
}> = [
  { resource: 'SCHOOLS', action: 'VIEW' },
  { resource: 'SCHOOLS', action: 'MANAGE' },
];

export const GOVERNANCE_HIGH_PRIVILEGE_ROLES = [
  UserRole.OWNER,
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export const FEATURE_MODULE_RESOURCE_MAP: Record<FeatureModuleKey, PermissionResourceKey> = {
  INCIDENT_REPORTS: 'INCIDENT_REPORTS',
  ATTENDANCE: 'ATTENDANCE',
  GRADEBOOK: 'GRADEBOOK',
  FORMS: 'FORMS',
  RE_REGISTRATION: 'RE_REGISTRATION',
  BILLING: 'BILLING',
  LIBRARY: 'LIBRARY',
  UNIFORM_ORDERS: 'UNIFORM_ORDERS',
  NOTIFICATIONS: 'NOTIFICATIONS',
};

export const RESOURCE_FEATURE_MODULE_MAP: Partial<Record<PermissionResourceKey, FeatureModuleKey>> =
  Object.fromEntries(
    Object.entries(FEATURE_MODULE_RESOURCE_MAP).map(([feature, resource]) => [resource, feature]),
  );

export function buildDefaultGovernanceVisibilitySettings(): GovernanceVisibilitySettings {
  return {
    ...GOVERNANCE_DEFAULT_VISIBILITY_SETTINGS,
  };
}

export function buildDefaultRolePermissionActionMap() {
  return Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, false])) as Record<
    PermissionActionKey,
    boolean
  >;
}

export function buildVisibilityResourceActionSkeleton() {
  return Object.fromEntries(
    PERMISSION_RESOURCES.map((resource) => [resource, buildDefaultRolePermissionActionMap()]),
  ) as Record<PermissionResourceKey, Record<PermissionActionKey, boolean>>;
}
