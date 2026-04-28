import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolYearDto } from './dto/create-school-year.dto';
import { AuthenticatedUser } from '../common/auth/auth-user';
import { ensureUserHasSchoolAccess } from '../common/access/school-access.util';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';
import { parseDateOnlyOrThrow } from '../common/dates/date-only.util';
import { AuditService } from '../audit/audit.service';
import { buildAuditDiff } from '../audit/audit-diff.util';

@Injectable()
export class SchoolYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private buildInclude() {
    return {
      school: true,
    };
  }

  private ensureValidDateRange(startDate: Date, endDate: Date) {
    if (startDate >= endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }
  }

  private handleRemoveError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new NotFoundException('School year not found');
      }

      if (error.code === 'P2003') {
        throw new ConflictException(
          'School year cannot be deleted because related records still exist',
        );
      }
    }

    throw new InternalServerErrorException(
      'Unable to delete school year right now',
    );
  }

  async create(user: AuthenticatedUser, data: CreateSchoolYearDto) {
    ensureUserHasSchoolAccess(user, data.schoolId);

    const school = await this.prisma.school.findUnique({
      where: { id: data.schoolId },
      select: { id: true },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }

    const startDate = parseDateOnlyOrThrow(data.startDate, 'startDate');
    const endDate = parseDateOnlyOrThrow(data.endDate, 'endDate');

    this.ensureValidDateRange(startDate, endDate);

    const created = await this.prisma.schoolYear.create({
      data: {
        schoolId: data.schoolId,
        name: data.name,
        startDate,
        endDate,
        isActive: true,
      },
      include: this.buildInclude(),
    });

    await this.auditService.log({
      actor: user,
      schoolId: created.schoolId,
      entityType: 'SchoolYear',
      entityId: created.id,
      action: 'CREATE',
      severity: AuditLogSeverity.INFO,
      summary: `Created school year ${created.name}`,
      targetDisplay: created.name,
    });

    return created;
  }

  findAllForSchool(
    user: AuthenticatedUser,
    schoolId: string,
    includeInactive = false,
  ) {
    ensureUserHasSchoolAccess(user, schoolId);

    return this.prisma.schoolYear.findMany({
      where: {
        schoolId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: this.buildInclude(),
    });
  }

  async update(user: AuthenticatedUser, id: string, data: UpdateSchoolYearDto) {
    const existing = await this.prisma.schoolYear.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('School year not found');
    }

    ensureUserHasSchoolAccess(user, existing.schoolId);
    const before = await this.prisma.schoolYear.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isActive: true,
      },
    });

    const nextStartDate = data.startDate
      ? parseDateOnlyOrThrow(data.startDate, 'startDate')
      : existing.startDate;
    const nextEndDate = data.endDate
      ? parseDateOnlyOrThrow(data.endDate, 'endDate')
      : existing.endDate;

    this.ensureValidDateRange(nextStartDate, nextEndDate);

    const updateData: {
      name?: string;
      startDate?: Date;
      endDate?: Date;
    } = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.startDate !== undefined) {
      updateData.startDate = nextStartDate;
    }

    if (data.endDate !== undefined) {
      updateData.endDate = nextEndDate;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    const updated = await this.prisma.schoolYear.update({
      where: { id },
      data: updateData,
      include: this.buildInclude(),
    });

    await this.auditService.log({
      actor: user,
      schoolId: existing.schoolId,
      entityType: 'SchoolYear',
      entityId: updated.id,
      action: 'UPDATE',
      severity: AuditLogSeverity.INFO,
      summary: `Updated school year ${updated.name}`,
      targetDisplay: updated.name,
      changesJson:
        buildAuditDiff({
          before,
          after: {
            name: updated.name,
            startDate: updated.startDate,
            endDate: updated.endDate,
            isActive: updated.isActive,
          },
        }) ?? undefined,
    });

    return updated;
  }

  async activate(user: AuthenticatedUser, id: string) {
    const { updated, schoolId } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.schoolYear.findUnique({
        where: { id },
        select: {
          id: true,
          schoolId: true,
        },
      });

      if (!existing) {
        throw new NotFoundException('School year not found');
      }

      ensureUserHasSchoolAccess(user, existing.schoolId);

      await tx.schoolYear.updateMany({
        where: {
          schoolId: existing.schoolId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      const updated = await tx.schoolYear.update({
        where: { id: existing.id },
        data: {
          isActive: true,
        },
        include: this.buildInclude(),
      });
      return { updated, schoolId: existing.schoolId };
    });

    await this.auditService.log({
      actor: user,
      schoolId,
      entityType: 'SchoolYear',
      entityId: updated.id,
      action: 'ACTIVATE',
      severity: AuditLogSeverity.INFO,
      summary: `Activated school year ${updated.name}`,
      targetDisplay: updated.name,
    });

    return updated;
  }

  async archive(user: AuthenticatedUser, id: string) {
    const { updated, archivedClassCount, schoolId } = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.schoolYear.findUnique({
          where: { id },
          select: {
            id: true,
            schoolId: true,
          },
        });

        if (!existing) {
          throw new NotFoundException('School year not found');
        }

        ensureUserHasSchoolAccess(user, existing.schoolId);

        const archivedClasses = await tx.class.updateMany({
          where: {
            schoolYearId: existing.id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        const updated = await tx.schoolYear.update({
          where: { id: existing.id },
          data: {
            isActive: false,
          },
          include: this.buildInclude(),
        });

        return {
          updated,
          archivedClassCount: archivedClasses.count,
          schoolId: existing.schoolId,
        };
      },
    );

    await this.auditService.log({
      actor: user,
      schoolId,
      entityType: 'SchoolYear',
      entityId: updated.id,
      action: 'END',
      severity: AuditLogSeverity.WARNING,
      summary: `Ended school year ${updated.name}`,
      targetDisplay: updated.name,
      metadataJson: {
        archivedClassCount,
      },
    });

    return updated;
  }

  async autoEndExpiredSchoolYearsAndArchiveClasses(referenceDate = new Date()) {
    const thresholdDate = new Date(referenceDate);
    thresholdDate.setHours(0, 0, 0, 0);
    thresholdDate.setDate(thresholdDate.getDate() - 15);

    const candidates = await this.prisma.schoolYear.findMany({
      where: {
        endDate: {
          lt: thresholdDate,
        },
        OR: [
          { isActive: true },
          {
            classes: {
              some: {
                isActive: true,
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
      orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }],
    });

    let endedSchoolYearCount = 0;
    let archivedClassCount = 0;

    for (const year of candidates) {
      const result = await this.prisma.$transaction(async (tx) => {
        const endedYears = await tx.schoolYear.updateMany({
          where: {
            id: year.id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        const archivedClasses = await tx.class.updateMany({
          where: {
            schoolYearId: year.id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        return {
          endedSchoolYears: endedYears.count,
          archivedClasses: archivedClasses.count,
        };
      });

      endedSchoolYearCount += result.endedSchoolYears;
      archivedClassCount += result.archivedClasses;
    }

    return {
      evaluatedSchoolYears: candidates.length,
      endedSchoolYearCount,
      archivedClassCount,
      thresholdDate: thresholdDate.toISOString(),
      rule: 'endDate_plus_15_days',
    };
  }

  async remove(user: AuthenticatedUser, id: string) {
    try {
      const existing = await this.prisma.schoolYear.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          schoolId: true,
          _count: {
            select: {
              classes: true,
              attendanceSessions: true,
              reportingPeriods: true,
            },
          },
        },
      });

      if (!existing) {
        throw new NotFoundException('School year not found');
      }

      ensureUserHasSchoolAccess(user, existing.schoolId);

      const dependencyPairs: Array<[string, number]> = [
        ['classes', existing._count.classes],
        ['attendance sessions', existing._count.attendanceSessions],
        ['reporting periods', existing._count.reportingPeriods],
      ];
      const dependencyLabels: string[] = dependencyPairs.flatMap(
        ([label, count]) => (count > 0 ? [label] : []),
      );

      if (dependencyLabels.length === 0) {
        await this.prisma.schoolYear.delete({
          where: { id: existing.id },
        });

        await this.auditService.log({
          actor: user,
          schoolId: existing.schoolId,
          entityType: 'SchoolYear',
          entityId: existing.id,
          action: 'DELETE',
          severity: AuditLogSeverity.HIGH,
          summary: `Deleted school year ${existing.name}`,
          targetDisplay: existing.name,
        });

        return {
          success: true,
          removalMode: 'deleted' as const,
        };
      }

      await this.prisma.$transaction([
        this.prisma.schoolYear.update({
          where: { id: existing.id },
          data: {
            isActive: false,
          },
        }),
        this.prisma.class.updateMany({
          where: {
            schoolYearId: existing.id,
          },
          data: {
            isActive: false,
          },
        }),
      ]);

      await this.auditService.log({
        actor: user,
        schoolId: existing.schoolId,
        entityType: 'SchoolYear',
        entityId: existing.id,
        action: 'ARCHIVE',
        severity: AuditLogSeverity.WARNING,
        summary: `Archived school year ${existing.name} because dependencies exist`,
        targetDisplay: existing.name,
        changesJson: {
          dependencyLabels,
        },
      });

      return {
        success: true,
        removalMode: 'archived' as const,
        reason: `School year was archived because related ${dependencyLabels.join(', ')} still exist`,
      };
    } catch (error) {
      this.handleRemoveError(error);
    }
  }
}
