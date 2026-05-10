import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSeverity, GovernanceSettingKey, Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { buildAuditDiff } from '../audit/audit-diff.util';
import { ensureUserHasSchoolAccess } from '../common/access/school-access.util';
import { getPrimarySchoolIdWithLegacyFallback } from '../common/access/school-membership.util';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  type FeatureModuleKey,
} from '../feature-toggles/feature-toggles.constants';
import { FeatureTogglesService } from '../feature-toggles/feature-toggles.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  getFallbackRolePermission,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type PermissionActionKey,
  type PermissionResourceKey,
} from '../role-permissions/role-permissions.constants';
import { TemporaryPermissionsService } from '../role-permissions/temporary-permissions.service';
import {
  buildDefaultGovernanceVisibilitySettings,
  buildVisibilityResourceActionSkeleton,
  FEATURE_MODULE_RESOURCE_MAP,
  GOVERNANCE_CORE_RESOURCES,
  GOVERNANCE_SETTING_KEYS,
  type GovernanceVisibilitySettings,
  RESOURCE_FEATURE_MODULE_MAP,
} from './governance.constants';
import { UpdateSchoolGovernanceSettingsDto } from './dto/update-school-governance-settings.dto';

function parseGovernanceSettingBoolean(value: Prisma.JsonValue) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return null;
}

@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly featureTogglesService: FeatureTogglesService,
    private readonly temporaryPermissionsService: TemporaryPermissionsService,
  ) {}

  private ensureGovernanceViewer(user: AuthenticatedUser) {
    if (
      user.role !== UserRole.OWNER &&
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('Only owner, super admin, or admin can view governance settings');
    }
  }

  private ensureGovernanceManager(user: AuthenticatedUser) {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only owners can update governance settings');
    }
  }

  private resolveSchoolId(user: AuthenticatedUser, requestedSchoolId?: string) {
    const normalizedRequested = requestedSchoolId?.trim() || null;

    if (normalizedRequested) {
      ensureUserHasSchoolAccess(user, normalizedRequested);
      return normalizedRequested;
    }

    const fallbackSchoolId = getPrimarySchoolIdWithLegacyFallback({
      memberships: user.memberships,
      legacySchoolId: user.schoolId ?? null,
    });

    if (!fallbackSchoolId) {
      throw new BadRequestException(
        'schoolId is required because your account has no school context',
      );
    }

    ensureUserHasSchoolAccess(user, fallbackSchoolId);
    return fallbackSchoolId;
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

  private getGovernanceUpdatesFromDto(dto: UpdateSchoolGovernanceSettingsDto) {
    const updates: Partial<GovernanceVisibilitySettings> = {
      [GovernanceSettingKey.PARENT_CAN_VIEW_GRADES]: dto.PARENT_CAN_VIEW_GRADES,
      [GovernanceSettingKey.PARENT_CAN_VIEW_ATTENDANCE]: dto.PARENT_CAN_VIEW_ATTENDANCE,
      [GovernanceSettingKey.STUDENT_CAN_VIEW_GRADES]: dto.STUDENT_CAN_VIEW_GRADES,
      [GovernanceSettingKey.STUDENT_CAN_VIEW_ATTENDANCE]: dto.STUDENT_CAN_VIEW_ATTENDANCE,
    };

    return Object.entries(updates).filter(
      (entry): entry is [GovernanceSettingKey, boolean] =>
        typeof entry[1] === 'boolean',
    );
  }

  private mergeGovernanceDefaults(
    rows: Array<{ key: GovernanceSettingKey; valueJson: Prisma.JsonValue }>,
  ) {
    const settings = buildDefaultGovernanceVisibilitySettings();

    for (const row of rows) {
      const parsed = parseGovernanceSettingBoolean(row.valueJson);
      if (typeof parsed === 'boolean') {
        settings[row.key] = parsed;
      }
    }

    return settings;
  }

  private getParentStudentVisibilityOverride(options: {
    role: UserRole;
    resource: PermissionResourceKey;
    action: PermissionActionKey;
    governanceSettings: GovernanceVisibilitySettings;
  }) {
    if (options.action !== 'VIEW') {
      return null;
    }

    if (options.role === UserRole.PARENT) {
      if (options.resource === 'GRADEBOOK') {
        return options.governanceSettings.PARENT_CAN_VIEW_GRADES;
      }

      if (options.resource === 'ATTENDANCE') {
        return options.governanceSettings.PARENT_CAN_VIEW_ATTENDANCE;
      }
    }

    if (options.role === UserRole.STUDENT) {
      if (options.resource === 'GRADEBOOK') {
        return options.governanceSettings.STUDENT_CAN_VIEW_GRADES;
      }

      if (options.resource === 'ATTENDANCE') {
        return options.governanceSettings.STUDENT_CAN_VIEW_ATTENDANCE;
      }
    }

    return null;
  }

  private resolveBasePermissionAllowed(options: {
    role: UserRole;
    resource: PermissionResourceKey;
    action: PermissionActionKey;
    rolePermissionRowsByKey: Map<string, boolean>;
  }) {
    if (options.role === UserRole.OWNER) {
      return true;
    }

    const key = `${options.resource}:${options.action}`;
    if (options.rolePermissionRowsByKey.has(key)) {
      return Boolean(options.rolePermissionRowsByKey.get(key));
    }

    return getFallbackRolePermission({
      role: options.role,
      resource: options.resource,
      action: options.action,
    });
  }

  private async resolveCoreSettingsAccessHealth(schoolId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          in: [UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ADMIN],
        },
        memberships: {
          some: {
            schoolId,
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (users.length === 0) {
      return {
        hasPrivilegedUsers: false,
        hasCoreSettingsAccess: false,
      };
    }

    const roleSettings = await this.prisma.rolePermissionSetting.findMany({
      where: {
        schoolId,
        role: {
          in: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
        },
        resource: 'SCHOOLS',
        action: {
          in: ['VIEW', 'MANAGE'],
        },
      },
      select: {
        role: true,
        resource: true,
        action: true,
        allowed: true,
      },
    });

    const roleMap = new Map(
      roleSettings.map((entry) => [
        `${entry.role}:${entry.resource}:${entry.action}`,
        entry.allowed,
      ]),
    );

    const hasCoreSettingsAccess = users.some((user) => {
      if (user.role === UserRole.OWNER) {
        return true;
      }

      const canView = roleMap.has(`${user.role}:SCHOOLS:VIEW`)
        ? Boolean(roleMap.get(`${user.role}:SCHOOLS:VIEW`))
        : getFallbackRolePermission({
            role: user.role,
            resource: 'SCHOOLS',
            action: 'VIEW',
          });
      const canManage = roleMap.has(`${user.role}:SCHOOLS:MANAGE`)
        ? Boolean(roleMap.get(`${user.role}:SCHOOLS:MANAGE`))
        : getFallbackRolePermission({
            role: user.role,
            resource: 'SCHOOLS',
            action: 'MANAGE',
          });

      return canView && canManage;
    });

    return {
      hasPrivilegedUsers: true,
      hasCoreSettingsAccess,
    };
  }

  async getSchoolGovernanceSettings(user: AuthenticatedUser, requestedSchoolId?: string) {
    this.ensureGovernanceViewer(user);

    const schoolId = this.resolveSchoolId(user, requestedSchoolId);
    await this.ensureSchoolExists(schoolId);

    const rows = await this.prisma.schoolGovernanceSetting.findMany({
      where: {
        schoolId,
        key: { in: [...GOVERNANCE_SETTING_KEYS] },
      },
      select: {
        key: true,
        valueJson: true,
      },
    });

    const visibility = this.mergeGovernanceDefaults(rows);
    const health = await this.resolveCoreSettingsAccessHealth(schoolId);

    return {
      schoolId,
      visibility,
      health,
      warnings: [
        ...(!health.hasPrivilegedUsers
          ? ['No active OWNER/SUPER_ADMIN/ADMIN memberships were found for this school.']
          : []),
        ...(health.hasPrivilegedUsers && !health.hasCoreSettingsAccess
          ? ['Core settings access is currently restricted for all active privileged users.']
          : []),
      ],
    };
  }

  async updateSchoolGovernanceSettings(
    user: AuthenticatedUser,
    schoolId: string,
    dto: UpdateSchoolGovernanceSettingsDto,
  ) {
    this.ensureGovernanceManager(user);
    ensureUserHasSchoolAccess(user, schoolId);
    await this.ensureSchoolExists(schoolId);

    const updates = this.getGovernanceUpdatesFromDto(dto);
    if (updates.length === 0) {
      throw new BadRequestException('At least one governance setting value is required');
    }

    const existingRows = await this.prisma.schoolGovernanceSetting.findMany({
      where: {
        schoolId,
        key: {
          in: updates.map(([key]) => key),
        },
      },
      select: {
        key: true,
        valueJson: true,
      },
    });

    const beforeByKey = new Map(existingRows.map((entry) => [entry.key, entry.valueJson]));

    await this.prisma.$transaction(
      updates.map(([key, enabled]) =>
        this.prisma.schoolGovernanceSetting.upsert({
          where: {
            schoolId_key: {
              schoolId,
              key,
            },
          },
          create: {
            schoolId,
            key,
            valueJson: enabled,
          },
          update: {
            valueJson: enabled,
          },
        }),
      ),
    );

    const changes = updates.map(([key, enabled]) => ({
      key,
      before: parseGovernanceSettingBoolean(beforeByKey.get(key) as Prisma.JsonValue) ?? null,
      after: enabled,
    }));

    await this.auditService.log({
      actor: user,
      schoolId,
      entityType: 'SchoolGovernanceSetting',
      action: 'BULK_UPDATE',
      severity: AuditLogSeverity.WARNING,
      summary: `Updated ${updates.length} governance setting values`,
      changesJson: buildAuditDiff({
        before: Object.fromEntries(changes.map((entry) => [entry.key, entry.before])),
        after: Object.fromEntries(changes.map((entry) => [entry.key, entry.after])),
      }) ?? undefined,
      metadataJson: {
        changedKeys: changes.map((entry) => entry.key),
      } as Prisma.InputJsonValue,
    });

    return this.getSchoolGovernanceSettings(user, schoolId);
  }

  async getAccessVisibility(user: AuthenticatedUser, requestedSchoolId?: string) {
    const schoolId = this.resolveSchoolId(user, requestedSchoolId);
    await this.ensureSchoolExists(schoolId);

    const [featureToggleResponse, governanceRows, rolePermissionRows, temporaryGrants] =
      await Promise.all([
        this.featureTogglesService.getSchoolFeatureToggles(user, schoolId),
        this.prisma.schoolGovernanceSetting.findMany({
          where: {
            schoolId,
            key: { in: [...GOVERNANCE_SETTING_KEYS] },
          },
          select: {
            key: true,
            valueJson: true,
          },
        }),
        this.prisma.rolePermissionSetting.findMany({
          where: {
            schoolId,
            role: user.role,
          },
          select: {
            resource: true,
            action: true,
            allowed: true,
          },
        }),
        this.temporaryPermissionsService.listActiveGrants({
          schoolId,
          role: user.role,
          userId: user.id,
        }),
      ]);

    const features = featureToggleResponse.features;
    const governanceVisibilitySettings = this.mergeGovernanceDefaults(governanceRows);

    const rolePermissionRowsByKey = new Map(
      rolePermissionRows.map((entry) => [
        `${entry.resource}:${entry.action}`,
        entry.allowed,
      ]),
    );

    const temporaryGrantByKey = new Map<string, boolean>();
    for (const grant of temporaryGrants) {
      const key = `${grant.resource}:${grant.action}`;
      if (!temporaryGrantByKey.has(key)) {
        temporaryGrantByKey.set(key, grant.allowed);
      }
    }

    const actionsByResource = buildVisibilityResourceActionSkeleton();

    for (const resource of PERMISSION_RESOURCES) {
      for (const action of PERMISSION_ACTIONS) {
        const resourceFeature = RESOURCE_FEATURE_MODULE_MAP[resource];
        const featureEnabled = resourceFeature ? features[resourceFeature] !== false : true;

        let allowed = this.resolveBasePermissionAllowed({
          role: user.role,
          resource,
          action,
          rolePermissionRowsByKey,
        });

        const temporaryOverride = temporaryGrantByKey.get(`${resource}:${action}`);
        if (typeof temporaryOverride === 'boolean') {
          allowed = temporaryOverride;
        }

        const visibilityOverride = this.getParentStudentVisibilityOverride({
          role: user.role,
          resource,
          action,
          governanceSettings: governanceVisibilitySettings,
        });
        if (typeof visibilityOverride === 'boolean') {
          allowed = allowed && visibilityOverride;
        }

        if (!featureEnabled) {
          allowed = false;
        }

        actionsByResource[resource][action] = allowed;
      }
    }

    const modules = Object.fromEntries(
      Object.entries(FEATURE_MODULE_RESOURCE_MAP).map(([feature, resource]) => {
        const featureModule = feature as FeatureModuleKey;
        const actions = actionsByResource[resource];

        return [
          featureModule,
          {
            featureEnabled: features[featureModule] !== false,
            canView: actions.VIEW,
            actions,
          },
        ];
      }),
    ) as Record<FeatureModuleKey, {
      featureEnabled: boolean;
      canView: boolean;
      actions: Record<PermissionActionKey, boolean>;
    }>;

    const coreAccess = GOVERNANCE_CORE_RESOURCES.reduce(
      (accumulator, current) => {
        const allowed = actionsByResource[current.resource][current.action];

        return {
          ...accumulator,
          [`${current.resource}:${current.action}`]: allowed,
        };
      },
      {} as Record<string, boolean>,
    );

    return {
      schoolId,
      role: user.role,
      features,
      governanceVisibility: governanceVisibilitySettings,
      modules,
      resources: actionsByResource,
      temporaryGrantCount: temporaryGrants.length,
      coreAccess,
    };
  }
}
