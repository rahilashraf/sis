import { UserRole } from '@prisma/client';

export const PERMISSION_ACTIONS = [
  'VIEW',
  'CREATE',
  'UPDATE',
  'DELETE',
  'EXPORT',
  'APPROVE',
  'MANAGE',
] as const;

export const PERMISSION_RESOURCES = [
  'INCIDENT_REPORTS',
  'ATTENDANCE',
  'GRADEBOOK',
  'FORMS',
  'RE_REGISTRATION',
  'BILLING',
  'LIBRARY',
  'UNIFORM_ORDERS',
  'NOTIFICATIONS',
  'ANNOUNCEMENTS',
  'USERS',
  'CLASSES',
  'SCHOOLS',
  'REPORTING_PERIODS',
] as const;

export const ROLE_PERMISSION_TARGET_ROLES = [
  UserRole.OWNER,
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.STAFF,
  UserRole.TEACHER,
  UserRole.SUPPLY_TEACHER,
  UserRole.PARENT,
  UserRole.STUDENT,
] as const;

export type PermissionActionKey = (typeof PERMISSION_ACTIONS)[number];
export type PermissionResourceKey = (typeof PERMISSION_RESOURCES)[number];

function isAdminLikeRole(role: UserRole) {
  return (
    role === UserRole.OWNER ||
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.ADMIN
  );
}

function isStaffLikeRole(role: UserRole) {
  return role === UserRole.STAFF;
}

function isTeacherLikeRole(role: UserRole) {
  return role === UserRole.TEACHER || role === UserRole.SUPPLY_TEACHER;
}

export function getFallbackRolePermission(options: {
  role: UserRole;
  resource: PermissionResourceKey;
  action: PermissionActionKey;
}) {
  const { role, resource, action } = options;

  if (role === UserRole.OWNER) {
    return true;
  }

  const isAdminLike = isAdminLikeRole(role);
  const isStaffLike = isStaffLikeRole(role);
  const isTeacherLike = isTeacherLikeRole(role);
  const isParent = role === UserRole.PARENT;
  const isStudent = role === UserRole.STUDENT;

  if (resource === 'INCIDENT_REPORTS') {
    if (action === 'MANAGE') {
      return role === UserRole.SUPER_ADMIN;
    }

    if (action === 'DELETE') {
      return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;
    }

    return isAdminLike || isStaffLike || isTeacherLike;
  }

  if (resource === 'ATTENDANCE') {
    if (action === 'DELETE' || action === 'APPROVE') {
      return isAdminLike || isStaffLike;
    }

    if (action === 'MANAGE') {
      return isAdminLike || isStaffLike;
    }

    return isAdminLike || isStaffLike || isTeacherLike;
  }

  if (resource === 'GRADEBOOK') {
    if (action === 'VIEW') {
      return isAdminLike || isStaffLike || role === UserRole.TEACHER || isParent;
    }

    if (action === 'MANAGE') {
      return isAdminLike || isStaffLike;
    }

    return isAdminLike || isStaffLike || role === UserRole.TEACHER;
  }

  if (resource === 'FORMS') {
    if (action === 'VIEW') {
      return isAdminLike || isStaffLike || isParent;
    }

    if (action === 'CREATE' || action === 'UPDATE') {
      return isAdminLike || isStaffLike || isParent;
    }

    if (action === 'MANAGE' || action === 'DELETE' || action === 'APPROVE') {
      return isAdminLike || isStaffLike;
    }

    return isAdminLike || isStaffLike;
  }

  if (resource === 'RE_REGISTRATION') {
    if (action === 'VIEW') {
      return isAdminLike || isStaffLike || isParent;
    }

    if (action === 'CREATE' || action === 'UPDATE') {
      return isAdminLike || isStaffLike || isParent;
    }

    if (action === 'MANAGE' || action === 'DELETE' || action === 'APPROVE') {
      return isAdminLike || isStaffLike;
    }

    return isAdminLike || isStaffLike;
  }

  if (resource === 'BILLING') {
    if (action === 'VIEW') {
      return isAdminLike || isStaffLike || isParent;
    }

    if (action === 'MANAGE' || action === 'APPROVE') {
      return isAdminLike || isStaffLike;
    }

    if (action === 'CREATE' || action === 'UPDATE' || action === 'DELETE') {
      return isAdminLike || isStaffLike;
    }

    return isAdminLike || isStaffLike;
  }

  if (resource === 'LIBRARY') {
    if (action === 'VIEW') {
      return isAdminLike || isStaffLike || isTeacherLike || isParent || isStudent;
    }

    if (action === 'MANAGE' || action === 'APPROVE') {
      return isAdminLike || isStaffLike;
    }

    if (action === 'CREATE' || action === 'UPDATE' || action === 'DELETE') {
      return isAdminLike || isStaffLike;
    }

    return isAdminLike || isStaffLike || isTeacherLike;
  }

  if (resource === 'UNIFORM_ORDERS') {
    if (action === 'VIEW') {
      return isAdminLike || isStaffLike || isParent;
    }

    if (action === 'CREATE' || action === 'UPDATE') {
      return isAdminLike || isStaffLike || isParent;
    }

    if (action === 'MANAGE' || action === 'APPROVE') {
      return isAdminLike || isStaffLike;
    }

    if (action === 'DELETE') {
      return isAdminLike || isStaffLike || isParent;
    }

    return isAdminLike || isStaffLike;
  }

  if (resource === 'NOTIFICATIONS') {
    if (action === 'VIEW') {
      return true;
    }

    if (action === 'CREATE' || action === 'UPDATE' || action === 'DELETE') {
      return isAdminLike || isStaffLike;
    }

    return isAdminLike || isStaffLike;
  }

  if (resource === 'ANNOUNCEMENTS') {
    if (action === 'VIEW') {
      return true;
    }

    if (action === 'CREATE' || action === 'UPDATE') {
      return isAdminLike || isStaffLike || role === UserRole.TEACHER;
    }

    if (action === 'DELETE' || action === 'MANAGE') {
      return isAdminLike || isStaffLike || role === UserRole.TEACHER;
    }

    return isAdminLike || isStaffLike || role === UserRole.TEACHER;
  }

  if (resource === 'USERS') {
    if (action === 'VIEW' || action === 'EXPORT') {
      return isAdminLike;
    }

    return isAdminLike;
  }

  if (resource === 'CLASSES') {
    if (action === 'VIEW') {
      return isAdminLike || isStaffLike || isTeacherLike || isParent || isStudent;
    }

    if (action === 'MANAGE') {
      return isAdminLike || isStaffLike;
    }

    if (action === 'CREATE' || action === 'UPDATE' || action === 'DELETE') {
      return isAdminLike || isStaffLike;
    }

    return isAdminLike || isStaffLike || role === UserRole.TEACHER;
  }

  if (resource === 'SCHOOLS') {
    if (action === 'VIEW') {
      return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;
    }

    return role === UserRole.SUPER_ADMIN;
  }

  if (resource === 'REPORTING_PERIODS') {
    if (action === 'VIEW') {
      return isAdminLike || isStaffLike;
    }

    if (action === 'CREATE' || action === 'UPDATE' || action === 'DELETE') {
      return isAdminLike;
    }

    return isAdminLike;
  }

  return false;
}
