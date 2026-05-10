import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSeverity, Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { buildAuditDiff } from '../audit/audit-diff.util';
import { ensureUserHasSchoolAccess } from '../common/access/school-access.util';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  getFallbackRolePermission,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  ROLE_PERMISSION_TARGET_ROLES,
  type PermissionActionKey,
  type PermissionResourceKey,
} from './role-permissions.constants';
import { GOVERNANCE_CORE_RESOURCES } from '../governance/governance.constants';
import {
  type RolePermissionEntryDto,
  UpdateRolePermissionsDto,
} from './dto/update-role-permissions.dto';

function toRolePermissionsMap(
  rows: Array<{
    resource: PermissionResourceKey;
    action: PermissionActionKey;
    allowed: boolean;
  }>,
) {
  const map = new Map<string, boolean>();

  for (const row of rows) {
    map.set(`${row.resource}:${row.action}`, row.allowed);
  }

  return map;
}

@Injectable()
export class RolePermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private ensureCanManageRolePermissions(user: AuthenticatedUser) {
    if (
      user.role !== UserRole.OWNER &&
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Only owner, super admin, or admin can manage role permissions',
      );
    }
  }

  private ensureValidTargetRole(role: string): role is UserRole {
    return ROLE_PERMISSION_TARGET_ROLES.includes(role as UserRole);
  }

  private ensureValidResource(resource: string): resource is PermissionResourceKey {
    return PERMISSION_RESOURCES.includes(resource as PermissionResourceKey);
  }

  private ensureValidAction(action: string): action is PermissionActionKey {
    return PERMISSION_ACTIONS.includes(action as PermissionActionKey);
  }

  private ensureTargetRoleMutable(role: UserRole) {
    if (role === UserRole.OWNER) {
      throw new ForbiddenException(
        'Owner permissions are immutable and always full access',
      );
    }
  }

  private async ensureSchoolExists(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }
  }

  private ensureUserCanAccessSchool(user: AuthenticatedUser, schoolId: string) {
    ensureUserHasSchoolAccess(user, schoolId);
  }

  private normalizeUpdateEntries(entries: RolePermissionEntryDto[]) {
    const deduped = new Map<string, RolePermissionEntryDto>();

    for (const entry of entries) {
      if (!this.ensureValidResource(entry.resource)) {
        throw new BadRequestException(`Invalid permission resource: ${entry.resource}`);
      }

      if (!this.ensureValidAction(entry.action)) {
        throw new BadRequestException(`Invalid permission action: ${entry.action}`);
      }

      const key = `${entry.resource}:${entry.action}`;
      deduped.set(key, {
        resource: entry.resource,
        action: entry.action,
        allowed: entry.allowed,
      });
    }

    return [...deduped.values()];
  }

  private async assertCoreSettingsAccessNotLockedOut(options: {
    schoolId: string;
    targetRole: UserRole;
    updates: RolePermissionEntryDto[];
  }) {
    const coreEntries = [
      ...new Set(
        GOVERNANCE_CORE_RESOURCES.map(
          (entry) => `${entry.resource}:${entry.action}`,
        ),
      ),
    ];

    const privilegedUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          in: [UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ADMIN],
        },
        memberships: {
          some: {
            schoolId: options.schoolId,
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (privilegedUsers.length === 0) {
      return;
    }

    const existingRows = await this.prisma.rolePermissionSetting.findMany({
      where: {
        schoolId: options.schoolId,
        role: {
          in: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
        },
        OR: GOVERNANCE_CORE_RESOURCES.map((entry) => ({
          resource: entry.resource,
          action: entry.action,
        })),
      },
      select: {
        role: true,
        resource: true,
        action: true,
        allowed: true,
      },
    });

    const existingByRoleKey = new Map(
      existingRows.map((entry) => [
        `${entry.role}:${entry.resource}:${entry.action}`,
        entry.allowed,
      ]),
    );
    const targetUpdatesByKey = new Map(
      options.updates.map((entry) => [`${entry.resource}:${entry.action}`, entry.allowed]),
    );

    const resolveEffectiveAllowed = (
      role: UserRole,
      resource: PermissionResourceKey,
      action: PermissionActionKey,
    ) => {
      if (role === UserRole.OWNER) {
        return true;
      }

      if (role === options.targetRole && targetUpdatesByKey.has(`${resource}:${action}`)) {
        return Boolean(targetUpdatesByKey.get(`${resource}:${action}`));
      }

      const roleKey = `${role}:${resource}:${action}`;
      if (existingByRoleKey.has(roleKey)) {
        return Boolean(existingByRoleKey.get(roleKey));
      }

      return getFallbackRolePermission({ role, resource, action });
    };

    const hasAnyCoreAccess = privilegedUsers.some((user) =>
      coreEntries.every((key) => {
        const [resource, action] = key.split(':') as [
          PermissionResourceKey,
          PermissionActionKey,
        ];
        return resolveEffectiveAllowed(user.role, resource, action);
      }),
    );

    if (!hasAnyCoreAccess) {
      throw new BadRequestException(
        'Update blocked because it would lock all active privileged users out of core governance settings',
      );
    }
  }

  async isAllowed(options: {
    user: AuthenticatedUser;
    schoolId: string;
    role: UserRole;
    resource: PermissionResourceKey;
    action: PermissionActionKey;
    fallbackAllowed?: boolean;
  }) {
    const { user, schoolId, role, resource, action } = options;

    if (role === UserRole.OWNER || user.role === UserRole.OWNER) {
      return true;
    }

    const row = await this.prisma.rolePermissionSetting.findUnique({
      where: {
        schoolId_role_resource_action: {
          schoolId,
          role,
          resource,
          action,
        },
      },
      select: {
        allowed: true,
      },
    });

    if (row) {
      return row.allowed;
    }

    if (typeof options.fallbackAllowed === 'boolean') {
      return options.fallbackAllowed;
    }

    return getFallbackRolePermission({ role, resource, action });
  }

  async assertAllowed(options: {
    user: AuthenticatedUser;
    schoolId: string;
    role: UserRole;
    resource: PermissionResourceKey;
    action: PermissionActionKey;
    fallbackAllowed?: boolean;
    errorMessage?: string;
  }) {
    const allowed = await this.isAllowed(options);

    if (!allowed) {
      throw new ForbiddenException(
        options.errorMessage ??
          `Role ${options.role} is not allowed to ${options.action} ${options.resource}`,
      );
    }
  }

  async getDeniedSchoolIdsForPermission(options: {
    role: UserRole;
    resource: PermissionResourceKey;
    action: PermissionActionKey;
    schoolIds: string[];
  }) {
    const { role, resource, action } = options;

    if (role === UserRole.OWNER) {
      return [] as string[];
    }

    const schoolIds = [...new Set(options.schoolIds.filter((schoolId) => schoolId))];
    if (schoolIds.length === 0) {
      return [] as string[];
    }

    const rows = await this.prisma.rolePermissionSetting.findMany({
      where: {
        role,
        resource,
        action,
        schoolId: { in: schoolIds },
      },
      select: {
        schoolId: true,
        allowed: true,
      },
    });

    const allowedBySchoolId = new Map(
      rows.map((row) => [row.schoolId, row.allowed] as const),
    );
    const fallbackAllowed = getFallbackRolePermission({ role, resource, action });

    return schoolIds.filter((schoolId) => {
      if (allowedBySchoolId.has(schoolId)) {
        return !allowedBySchoolId.get(schoolId);
      }

      return !fallbackAllowed;
    });
  }

  async getRolePermissions(options: {
    user: AuthenticatedUser;
    schoolId: string;
    role: UserRole;
  }) {
    const { user, schoolId, role } = options;

    this.ensureCanManageRolePermissions(user);
    this.ensureUserCanAccessSchool(user, schoolId);
    await this.ensureSchoolExists(schoolId);

    if (!this.ensureValidTargetRole(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    const rows = await this.prisma.rolePermissionSetting.findMany({
      where: {
        schoolId,
        role,
      },
      select: {
        resource: true,
        action: true,
        allowed: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });

    const rowMap = toRolePermissionsMap(rows);

    const permissions = PERMISSION_RESOURCES.flatMap((resource) =>
      PERMISSION_ACTIONS.map((action) => {
        const key = `${resource}:${action}`;
        const hasCustom = rowMap.has(key);
        const fallbackAllowed = getFallbackRolePermission({ role, resource, action });
        const allowed = role === UserRole.OWNER
          ? true
          : hasCustom
            ? Boolean(rowMap.get(key))
            : fallbackAllowed;

        return {
          resource,
          action,
          allowed,
          source: role === UserRole.OWNER ? 'owner' : hasCustom ? 'custom' : 'fallback',
        } as const;
      }),
    );

    return {
      schoolId,
      role,
      permissions,
    };
  }

  async updateRolePermissions(options: {
    user: AuthenticatedUser;
    schoolId: string;
    role: UserRole;
    body: UpdateRolePermissionsDto;
  }) {
    const { user, schoolId, role, body } = options;

    this.ensureCanManageRolePermissions(user);
    this.ensureUserCanAccessSchool(user, schoolId);
    await this.ensureSchoolExists(schoolId);

    if (!this.ensureValidTargetRole(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    this.ensureTargetRoleMutable(role);

    const normalizedEntries = this.normalizeUpdateEntries(body.permissions);
    if (normalizedEntries.length === 0) {
      throw new BadRequestException('At least one permission entry is required');
    }

    await this.assertCoreSettingsAccessNotLockedOut({
      schoolId,
      targetRole: role,
      updates: normalizedEntries,
    });

    const existingRows = await this.prisma.rolePermissionSetting.findMany({
      where: {
        schoolId,
        role,
        OR: normalizedEntries.map((entry) => ({
          resource: entry.resource,
          action: entry.action,
        })),
      },
      select: {
        resource: true,
        action: true,
        allowed: true,
      },
    });
    const beforeByKey = new Map(
      existingRows.map((entry) => [`${entry.resource}:${entry.action}`, entry.allowed]),
    );

    await this.prisma.$transaction(
      normalizedEntries.map((entry) =>
        this.prisma.rolePermissionSetting.upsert({
          where: {
            schoolId_role_resource_action: {
              schoolId,
              role,
              resource: entry.resource,
              action: entry.action,
            },
          },
          create: {
            schoolId,
            role,
            resource: entry.resource,
            action: entry.action,
            allowed: entry.allowed,
          },
          update: {
            allowed: entry.allowed,
          },
        }),
      ),
    );

    await this.auditService.log({
      actor: user,
      schoolId,
      entityType: 'RolePermissionSetting',
      action: 'BULK_UPDATE',
      severity: AuditLogSeverity.WARNING,
      summary: `Updated ${normalizedEntries.length} role permission entries for ${role}`,
      changesJson:
        buildAuditDiff({
          before: Object.fromEntries(
            normalizedEntries.map((entry) => [
              `${entry.resource}:${entry.action}`,
              beforeByKey.has(`${entry.resource}:${entry.action}`)
                ? beforeByKey.get(`${entry.resource}:${entry.action}`)
                : getFallbackRolePermission({
                    role,
                    resource: entry.resource,
                    action: entry.action,
                  }),
            ]),
          ),
          after: Object.fromEntries(
            normalizedEntries.map((entry) => [
              `${entry.resource}:${entry.action}`,
              entry.allowed,
            ]),
          ),
        }) ?? undefined,
      metadataJson: {
        role,
        updatedByRole: user.role,
        updatedCount: normalizedEntries.length,
        changedEntries: normalizedEntries.map((entry) => ({
          resource: entry.resource,
          action: entry.action,
          before: beforeByKey.has(`${entry.resource}:${entry.action}`)
            ? beforeByKey.get(`${entry.resource}:${entry.action}`)
            : getFallbackRolePermission({
                role,
                resource: entry.resource,
                action: entry.action,
              }),
          after: entry.allowed,
        })),
      } as Prisma.InputJsonValue,
    });

    return this.getRolePermissions({ user, schoolId, role });
  }
}
