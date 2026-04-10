import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportingPeriodDto } from './dto/create-reporting-period.dto';
import { QueryReportingPeriodsDto } from './dto/query-reporting-periods.dto';
import { UpdateReportingPeriodDto } from './dto/update-reporting-period.dto';

type AuthUserMembership = {
  schoolId: string;
  isActive: boolean;
};

type AuthUser = {
  id: string;
  role: UserRole;
  memberships?: AuthUserMembership[];
};

@Injectable()
export class ReportingPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildInclude() {
    return {
      school: true,
      schoolYear: true,
    };
  }

  private isBypassRole(role: UserRole) {
    return role === 'OWNER' || role === 'SUPER_ADMIN';
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
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }

    return date;
  }

  private ensureUserCanAccessSchool(user: AuthUser, schoolId: string) {
    if (this.isBypassRole(user.role)) {
      return;
    }

    const hasMembership = (user.memberships ?? []).some(
      (membership) => membership.schoolId === schoolId && membership.isActive,
    );

    if (!hasMembership) {
      throw new ForbiddenException('You do not have school access');
    }
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
      throw new ConflictException('Reporting period overlaps an existing period');
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
    this.ensureUserCanAccessSchool(user, data.schoolId);

    const schoolYear = await this.ensureSchoolAndYearAreValid(
      data.schoolId,
      data.schoolYearId,
    );
    const startsAt = this.parseDate(data.startsAt, 'startsAt');
    const endsAt = this.parseDate(data.endsAt, 'endsAt');

    this.ensureDateRange(startsAt, endsAt);
    this.ensureDatesWithinSchoolYear(startsAt, endsAt, schoolYear);
    await this.ensureNoOverlap(data.schoolId, data.schoolYearId, startsAt, endsAt);

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
        },
        include: this.buildInclude(),
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async findAll(user: AuthUser, query: QueryReportingPeriodsDto) {
    this.ensureUserCanAccessSchool(user, query.schoolId);
    await this.ensureSchoolAndYearAreValid(query.schoolId, query.schoolYearId);

    return this.prisma.reportingPeriod.findMany({
      where: {
        schoolId: query.schoolId,
        schoolYearId: query.schoolYearId,
      },
      orderBy: [{ order: 'asc' }, { startsAt: 'asc' }, { createdAt: 'asc' }],
      include: this.buildInclude(),
    });
  }

  async findOne(user: AuthUser, id: string) {
    const reportingPeriod = await this.prisma.reportingPeriod.findUnique({
      where: { id },
      include: this.buildInclude(),
    });

    if (!reportingPeriod) {
      throw new NotFoundException('Reporting period not found');
    }

    this.ensureUserCanAccessSchool(user, reportingPeriod.schoolId);

    return reportingPeriod;
  }

  async update(user: AuthUser, id: string, data: UpdateReportingPeriodDto) {
    const existing = await this.prisma.reportingPeriod.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Reporting period not found');
    }

    this.ensureUserCanAccessSchool(user, existing.schoolId);

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
          ...(data.startsAt !== undefined ? { startsAt } : {}),
          ...(data.endsAt !== undefined ? { endsAt } : {}),
        },
        include: this.buildInclude(),
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async remove(user: AuthUser, id: string) {
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

    this.ensureUserCanAccessSchool(user, existing.schoolId);

    return this.prisma.reportingPeriod.delete({
      where: { id: existing.id },
    });
  }
}
