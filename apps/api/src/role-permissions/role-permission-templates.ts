import { UserRole } from '@prisma/client';
import {
  getFallbackRolePermission,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  ROLE_PERMISSION_TARGET_ROLES,
  type PermissionActionKey,
  type PermissionResourceKey,
} from './role-permissions.constants';

export type RolePermissionTemplateEntry = {
  role: UserRole;
  resource: PermissionResourceKey;
  action: PermissionActionKey;
  allowed: boolean;
};

export type RolePermissionTemplateName = 'DEFAULT_STANDARD';

export const ROLE_PERMISSION_TEMPLATE_NAMES: RolePermissionTemplateName[] = ['DEFAULT_STANDARD'];

export function buildRolePermissionTemplateEntries(
  template: RolePermissionTemplateName,
): RolePermissionTemplateEntry[] {
  if (template !== 'DEFAULT_STANDARD') {
    return [];
  }

  return ROLE_PERMISSION_TARGET_ROLES.flatMap((role) =>
    PERMISSION_RESOURCES.flatMap((resource) =>
      PERMISSION_ACTIONS.map((action) => ({
        role,
        resource,
        action,
        allowed: getFallbackRolePermission({ role, resource, action }),
      })),
    ),
  );
}
