import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';

export function isBypassRole(role: UserRole) {
  return role === UserRole.OWNER || role === UserRole.SUPER_ADMIN;
}

export function isSchoolAdminRole(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.STAFF;
}

export function isTeacherRole(role: UserRole) {
  return role === UserRole.TEACHER || role === UserRole.SUPPLY_TEACHER;
}

export function getAccessibleSchoolIds(user: AuthenticatedUser) {
  return (user.memberships ?? [])
    .filter((membership) => membership.isActive)
    .map((membership) => membership.schoolId);
}

export function ensureUserHasSchoolAccess(
  user: AuthenticatedUser,
  schoolId: string,
) {
  if (isBypassRole(user.role)) {
    return;
  }

  const hasAccess = getAccessibleSchoolIds(user).includes(schoolId);

  if (!hasAccess) {
    throw new ForbiddenException('You do not have school access');
  }
}
