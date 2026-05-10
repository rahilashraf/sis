import type { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  type PermissionActionKey,
  type PermissionResourceKey,
} from './role-permissions.constants';
import { RolePermissionsService } from './role-permissions.service';

export async function assertRolePermissionForSchool(options: {
  rolePermissionsService: RolePermissionsService;
  user: AuthenticatedUser;
  schoolId: string;
  role: UserRole;
  resource: PermissionResourceKey;
  action: PermissionActionKey;
  fallbackAllowed?: boolean;
  errorMessage?: string;
}) {
  await options.rolePermissionsService.assertAllowed({
    user: options.user,
    schoolId: options.schoolId,
    role: options.role,
    resource: options.resource,
    action: options.action,
    fallbackAllowed: options.fallbackAllowed,
    errorMessage: options.errorMessage,
  });
}
