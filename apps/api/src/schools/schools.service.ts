import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSeverity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isHighPrivilegeRole,
  isBypassRole,
} from '../common/access/school-access.util';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { CreateSchoolDto } from './dto/create-school.dto';
import { AuditService } from '../audit/audit.service';
import { buildAuditDiff } from '../audit/audit-diff.util';

@Injectable()
export class SchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async getSchoolOrThrow(user: AuthenticatedUser, schoolId: string) {
    const existingSchool = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!existingSchool) {
      throw new NotFoundException('School not found');
    }

    ensureUserHasSchoolAccess(user, existingSchool.id);

    return existingSchool;
  }

  findAll(user: AuthenticatedUser, includeInactive = false) {
    const accessibleSchoolIds = getAccessibleSchoolIds(user);

    return this.prisma.school.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(isBypassRole(user.role)
          ? {}
          : {
              id: {
                in: accessibleSchoolIds,
              },
            }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: AuthenticatedUser, data: CreateSchoolDto) {
    if (!isHighPrivilegeRole(user.role)) {
      throw new ForbiddenException(
        'Only owner and super admin roles can create schools',
      );
    }

    const created = await this.prisma.school.create({
      data: {
        name: data.name,
        shortName: data.shortName,
      },
    });

    await this.auditService.log({
      actor: user,
      schoolId: created.id,
      entityType: 'School',
      entityId: created.id,
      action: 'CREATE',
      severity: AuditLogSeverity.INFO,
      summary: `Created school ${created.name}`,
      targetDisplay: created.name,
    });

    return created;
  }

  async update(user: AuthenticatedUser, schoolId: string, data: UpdateSchoolDto) {
    await this.getSchoolOrThrow(user, schoolId);
    const before = await this.prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        shortName: true,
      },
    });

    const updateData: {
      name?: string;
      shortName?: string | null;
    } = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.shortName !== undefined) {
      updateData.shortName = data.shortName;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    const updated = await this.prisma.school.update({
      where: { id: schoolId },
      data: updateData,
    });

    await this.auditService.log({
      actor: user,
      schoolId: updated.id,
      entityType: 'School',
      entityId: updated.id,
      action: 'UPDATE',
      severity: AuditLogSeverity.INFO,
      summary: `Updated school ${updated.name}`,
      targetDisplay: updated.name,
      changesJson:
        buildAuditDiff({
          before,
          after: {
            name: updated.name,
            shortName: updated.shortName,
          },
        }) ?? undefined,
    });

    return updated;
  }

  async setActiveState(
    user: AuthenticatedUser,
    schoolId: string,
    isActive: boolean,
  ) {
    const existingSchool = await this.getSchoolOrThrow(user, schoolId);

    if (existingSchool.isActive === isActive) {
      return this.prisma.school.findUniqueOrThrow({
        where: { id: schoolId },
      });
    }

    const updated = await this.prisma.school.update({
      where: { id: schoolId },
      data: { isActive },
    });

    await this.auditService.log({
      actor: user,
      schoolId: updated.id,
      entityType: 'School',
      entityId: updated.id,
      action: isActive ? 'ACTIVATE' : 'ARCHIVE',
      severity: isActive ? AuditLogSeverity.INFO : AuditLogSeverity.WARNING,
      summary: `${isActive ? 'Activated' : 'Archived'} school ${updated.name}`,
      targetDisplay: updated.name,
    });

    return updated;
  }

  async remove(user: AuthenticatedUser, schoolId: string) {
    const existingSchool = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            memberships: true,
            schoolYears: true,
            classes: true,
            attendanceSessions: true,
            reportingPeriods: true,
          },
        },
      },
    });

    if (!existingSchool) {
      throw new NotFoundException('School not found');
    }

    ensureUserHasSchoolAccess(user, existingSchool.id);

    const dependencyLabels: string[] = [
      ['memberships', existingSchool._count.memberships],
      ['school years', existingSchool._count.schoolYears],
      ['classes', existingSchool._count.classes],
      ['attendance sessions', existingSchool._count.attendanceSessions],
      ['reporting periods', existingSchool._count.reportingPeriods],
    ].flatMap(([label, count]: [string, number]) => (count > 0 ? [label] : []));

    if (dependencyLabels.length === 0) {
      await this.prisma.school.delete({
        where: { id: existingSchool.id },
      });

      await this.auditService.log({
        actor: user,
        schoolId: existingSchool.id,
        entityType: 'School',
        entityId: existingSchool.id,
        action: 'DELETE',
        severity: AuditLogSeverity.HIGH,
        summary: `Deleted school ${existingSchool.name}`,
        targetDisplay: existingSchool.name,
      });

      return {
        success: true,
        removalMode: 'deleted' as const,
      };
    }

    await this.prisma.$transaction([
      this.prisma.school.update({
        where: { id: existingSchool.id },
        data: {
          isActive: false,
        },
      }),
      this.prisma.schoolYear.updateMany({
        where: {
          schoolId: existingSchool.id,
        },
        data: {
          isActive: false,
        },
      }),
      this.prisma.class.updateMany({
        where: {
          schoolId: existingSchool.id,
        },
        data: {
          isActive: false,
        },
      }),
    ]);

    await this.auditService.log({
      actor: user,
      schoolId: existingSchool.id,
      entityType: 'School',
      entityId: existingSchool.id,
      action: 'ARCHIVE',
      severity: AuditLogSeverity.WARNING,
      summary: `Archived school ${existingSchool.name} because dependencies exist`,
      targetDisplay: existingSchool.name,
      changesJson: {
        dependencyLabels,
      },
    });

    return {
      success: true,
      removalMode: 'archived' as const,
      reason: `School was archived because related ${dependencyLabels.join(', ')} still exist`,
    };
  }
}
