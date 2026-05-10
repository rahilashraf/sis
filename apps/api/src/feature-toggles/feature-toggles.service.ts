import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSeverity, Prisma, UserRole } from '@prisma/client';
import { buildAuditDiff } from '../audit/audit-diff.util';
import { AuditService } from '../audit/audit.service';
import { ensureUserHasSchoolAccess } from '../common/access/school-access.util';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import { getPrimarySchoolIdWithLegacyFallback } from '../common/access/school-membership.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildDefaultSchoolFeatureToggles,
  SCHOOL_FEATURE_MODULES,
  type FeatureModuleKey,
  type SchoolFeatureTogglesMap,
} from './feature-toggles.constants';
import { UpdateSchoolFeatureTogglesDto } from './dto/update-school-feature-toggles.dto';

@Injectable()
export class FeatureTogglesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private ensureOwnerAccess(user: AuthenticatedUser) {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only owners can manage feature toggles');
    }
  }

  private resolveRequestedSchoolId(
    user: AuthenticatedUser,
    requestedSchoolId?: string,
  ) {
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

  private toFeatureToggleResponse(
    schoolId: string,
    rows: Array<{ module: FeatureModuleKey; enabled: boolean }>,
  ) {
    const features = buildDefaultSchoolFeatureToggles();

    for (const row of rows) {
      features[row.module] = row.enabled;
    }

    return {
      schoolId,
      features,
    };
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

  private getFeatureUpdatesFromDto(dto: UpdateSchoolFeatureTogglesDto) {
    const updates: Partial<SchoolFeatureTogglesMap> = {
      INCIDENT_REPORTS: dto.INCIDENT_REPORTS,
      ATTENDANCE: dto.ATTENDANCE,
      GRADEBOOK: dto.GRADEBOOK,
      FORMS: dto.FORMS,
      RE_REGISTRATION: dto.RE_REGISTRATION,
      BILLING: dto.BILLING,
      LIBRARY: dto.LIBRARY,
      UNIFORM_ORDERS: dto.UNIFORM_ORDERS,
      NOTIFICATIONS: dto.NOTIFICATIONS,
    };

    const entries = Object.entries(updates).filter(
      (entry): entry is [FeatureModuleKey, boolean] =>
        typeof entry[1] === 'boolean',
    );

    return entries;
  }

  async getSchoolFeatureToggles(user: AuthenticatedUser, requestedSchoolId?: string) {
    const schoolId = this.resolveRequestedSchoolId(user, requestedSchoolId);

    const rows = await this.prisma.schoolFeatureToggle.findMany({
      where: { schoolId },
      select: {
        module: true,
        enabled: true,
      },
    });

    return this.toFeatureToggleResponse(schoolId, rows);
  }

  async updateSchoolFeatureToggles(
    user: AuthenticatedUser,
    schoolId: string,
    dto: UpdateSchoolFeatureTogglesDto,
  ) {
    this.ensureOwnerAccess(user);
    await this.ensureSchoolExists(schoolId);

    const updates = this.getFeatureUpdatesFromDto(dto);
    if (updates.length === 0) {
      throw new BadRequestException('At least one feature toggle value is required');
    }

    const existingRows = await this.prisma.schoolFeatureToggle.findMany({
      where: {
        schoolId,
        module: {
          in: updates.map(([module]) => module),
        },
      },
      select: {
        module: true,
        enabled: true,
      },
    });

    const current = buildDefaultSchoolFeatureToggles();
    for (const row of existingRows) {
      current[row.module] = row.enabled;
    }

    const next = { ...current };
    for (const [module, enabled] of updates) {
      next[module] = enabled;
    }

    const enabledCount = this.getAllFeatureModules().filter(
      (module) => next[module],
    ).length;

    if (enabledCount === 0) {
      throw new BadRequestException(
        'At least one module must remain enabled to preserve safe school operations',
      );
    }

    await this.prisma.$transaction(
      updates.map(([module, enabled]) =>
        this.prisma.schoolFeatureToggle.upsert({
          where: {
            schoolId_module: {
              schoolId,
              module,
            },
          },
          create: {
            schoolId,
            module,
            enabled,
          },
          update: {
            enabled,
          },
        }),
      ),
    );

    const before = Object.fromEntries(
      updates.map(([module]) => [module, current[module]]),
    );
    const after = Object.fromEntries(
      updates.map(([module]) => [module, next[module]]),
    );

    await this.auditService.log({
      actor: user,
      schoolId,
      entityType: 'SchoolFeatureToggle',
      action: 'BULK_UPDATE',
      severity: AuditLogSeverity.WARNING,
      summary: `Updated ${updates.length} feature toggle values`,
      changesJson:
        buildAuditDiff({
          before,
          after,
        }) ?? undefined,
      metadataJson: {
        changedModules: updates.map(([module]) => module),
      } as Prisma.InputJsonValue,
    });

    return this.getSchoolFeatureToggles(user, schoolId);
  }

  async isFeatureEnabledForSchool(schoolId: string, module: FeatureModuleKey) {
    const row = await this.prisma.schoolFeatureToggle.findUnique({
      where: {
        schoolId_module: {
          schoolId,
          module,
        },
      },
      select: {
        enabled: true,
      },
    });

    if (!row) {
      return true;
    }

    return row.enabled;
  }

  async assertFeatureEnabledForSchool(schoolId: string, module: FeatureModuleKey) {
    const enabled = await this.isFeatureEnabledForSchool(schoolId, module);

    if (!enabled) {
      throw new ForbiddenException(
        `${module.replaceAll('_', ' ')} is disabled for this school`,
      );
    }
  }

  async getDisabledSchoolIdsForFeature(
    module: FeatureModuleKey,
    schoolIds?: string[],
  ) {
    const normalizedSchoolIds = schoolIds?.filter((schoolId) => schoolId) ?? [];

    const where: Prisma.SchoolFeatureToggleWhereInput = {
      module,
      enabled: false,
      ...(normalizedSchoolIds.length > 0
        ? {
            schoolId: {
              in: normalizedSchoolIds,
            },
          }
        : {}),
    };

    const rows = await this.prisma.schoolFeatureToggle.findMany({
      where,
      select: {
        schoolId: true,
      },
    });

    return rows.map((row) => row.schoolId);
  }

  getAllFeaturesEnabledMap() {
    return buildDefaultSchoolFeatureToggles();
  }

  getAllFeatureModules() {
    return [...SCHOOL_FEATURE_MODULES];
  }
}
