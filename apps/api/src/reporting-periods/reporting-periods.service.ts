import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  isBypassRole,
  isHighPrivilegeRole,
} from '../common/access/school-access.util';
import { parseDateOnlyOrThrow } from '../common/dates/date-only.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportingPeriodDto } from './dto/create-reporting-period.dto';
import { QueryReportingPeriodsDto } from './dto/query-reporting-periods.dto';
import { UpdateReportingPeriodDto } from './dto/update-reporting-period.dto';

type AuthUser = AuthenticatedUser;

@Injectable()
export class ReportingPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildInclude() {
    return {
      school: true,
      schoolYear: true,
    };
  }

  private ensureHighPrivilege(user: AuthUser) {
    if (!isHighPrivilegeRole(user.role)) {
      throw new ForbiddenException('You do not have reporting period access');
    }
  }

  private ensureDateRange(startsAt: Date, endsAt: Date) {
    if (startsAt >= endsAt) {
      throw new BadRequestException('startsAt must be before endsAt');
    }
  }

  private ensureDatesWithinSchoolYear(
    startsAt: Date,
    endsAt: Date,
    schoolYear: {
      startDate: Date;
      endDate: Date;
    },
  ) {
    if (startsAt < schoolYear.startDate || endsAt > schoolYear.endDate) {
      throw new BadRequestException(
        'Reporting period dates must fall within the school year',
      );
    }
  }

  private parseDate(value: string, fieldName: 'startsAt' | 'endsAt') {
    return parseDateOnlyOrThrow(value, fieldName);
  }

  private async ensureSchoolAndYearAreValid(
    schoolId: string,
    schoolYearId: string,
  ) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }

    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: schoolYearId },
      select: {
        id: true,
        schoolId: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!schoolYear) {
      throw new NotFoundException('School year not found');
    }

    if (schoolYear.schoolId !== schoolId) {
      throw new BadRequestException('schoolYearId does not belong to schoolId');
    }

    return schoolYear;
  }

  private async getPeriodOrThrow(id: string) {
    const period = await this.prisma.reportingPeriod.findUnique({
      where: { id },
      include: this.buildInclude(),
    });

    if (!period) {
      throw new NotFoundException('Reporting period not found');
    }

    return period;
  }

  private async ensureNoOverlap(
    schoolId: string,
    schoolYearId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ) {
    const overlappingPeriod = await this.prisma.reportingPeriod.findFirst({
      where: {
        schoolId,
        schoolYearId,
        ...(excludeId
          ? {
              id: {
                not: excludeId,
              },
            }
          : {}),
        startsAt: {
          lt: endsAt,
        },
        endsAt: {
          gt: startsAt,
        },
      },
      select: { id: true },
    });

    if (overlappingPeriod) {
      throw new ConflictException(
        'Reporting period overlaps an existing period',
      );
    }
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Reporting period key or order must be unique within the school year',
      );
    }

    throw error;
  }

  async create(user: AuthUser, data: CreateReportingPeriodDto) {
    this.ensureHighPrivilege(user);
    ensureUserHasSchoolAccess(user, data.schoolId);

    const schoolYear = await this.ensureSchoolAndYearAreValid(
      data.schoolId,
      data.schoolYearId,
    );
    const startsAt = this.parseDate(data.startsAt, 'startsAt');
    const endsAt = this.parseDate(data.endsAt, 'endsAt');

    this.ensureDateRange(startsAt, endsAt);
    this.ensureDatesWithinSchoolYear(startsAt, endsAt, schoolYear);
    await this.ensureNoOverlap(
      data.schoolId,
      data.schoolYearId,
      startsAt,
      endsAt,
    );

    try {
      return await this.prisma.reportingPeriod.create({
        data: {
          schoolId: data.schoolId,
          schoolYearId: data.schoolYearId,
          name: data.name,
          key: data.key,
          order: data.order,
          startsAt,
          endsAt,
          isActive: true,
          isLocked: false,
        },
        include: this.buildInclude(),
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async findAll(user: AuthUser, query: QueryReportingPeriodsDto) {
    if (!isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, query.schoolId);
    }
    await this.ensureSchoolAndYearAreValid(query.schoolId, query.schoolYearId);

    const includeInactive = query.includeInactive ?? false;

    return this.prisma.reportingPeriod.findMany({
      where: {
        schoolId: query.schoolId,
        schoolYearId: query.schoolYearId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ order: 'asc' }, { startsAt: 'asc' }, { createdAt: 'asc' }],
      include: this.buildInclude(),
    });
  }

  async findOne(user: AuthUser, id: string) {
    const reportingPeriod = await this.getPeriodOrThrow(id);

    if (!isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, reportingPeriod.schoolId);
    }

    return reportingPeriod;
  }

  async update(user: AuthUser, id: string, data: UpdateReportingPeriodDto) {
    this.ensureHighPrivilege(user);

    const existing = await this.prisma.reportingPeriod.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
        isActive: true,
        isLocked: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Reporting period not found');
    }

    ensureUserHasSchoolAccess(user, existing.schoolId);

    const hasNonLockUpdates =
      data.name !== undefined ||
      data.key !== undefined ||
      data.order !== undefined ||
      data.startsAt !== undefined ||
      data.endsAt !== undefined;

    if (existing.isLocked && hasNonLockUpdates) {
      throw new BadRequestException('Reporting period is locked');
    }

    if (!existing.isActive && hasNonLockUpdates) {
      throw new BadRequestException('Reporting period is archived');
    }

    const schoolYear = await this.ensureSchoolAndYearAreValid(
      existing.schoolId,
      existing.schoolYearId,
    );
    const startsAt = data.startsAt
      ? this.parseDate(data.startsAt, 'startsAt')
      : existing.startsAt;
    const endsAt = data.endsAt
      ? this.parseDate(data.endsAt, 'endsAt')
      : existing.endsAt;

    this.ensureDateRange(startsAt, endsAt);
    this.ensureDatesWithinSchoolYear(startsAt, endsAt, schoolYear);
    await this.ensureNoOverlap(
      existing.schoolId,
      existing.schoolYearId,
      startsAt,
      endsAt,
      existing.id,
    );

    try {
      return await this.prisma.reportingPeriod.update({
        where: { id: existing.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.key !== undefined ? { key: data.key } : {}),
          ...(data.order !== undefined ? { order: data.order } : {}),
          ...(data.isLocked !== undefined ? { isLocked: data.isLocked } : {}),
          ...(data.startsAt !== undefined ? { startsAt } : {}),
          ...(data.endsAt !== undefined ? { endsAt } : {}),
        },
        include: this.buildInclude(),
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async setActive(user: AuthUser, id: string, isActive: boolean) {
    this.ensureHighPrivilege(user);

    const existing = await this.prisma.reportingPeriod.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Reporting period not found');
    }

    ensureUserHasSchoolAccess(user, existing.schoolId);

    return this.prisma.reportingPeriod.update({
      where: { id: existing.id },
      data: { isActive },
      include: this.buildInclude(),
    });
  }

  async setLocked(user: AuthUser, id: string, isLocked: boolean) {
    this.ensureHighPrivilege(user);

    const existing = await this.getPeriodOrThrow(id);
    ensureUserHasSchoolAccess(user, existing.schoolId);

    if (!existing.isActive) {
      throw new BadRequestException('Reporting period is archived');
    }

    return this.prisma.reportingPeriod.update({
      where: { id: existing.id },
      data: { isLocked },
      include: this.buildInclude(),
    });
  }
}
