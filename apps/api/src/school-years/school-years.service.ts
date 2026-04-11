import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolYearDto } from './dto/create-school-year.dto';
import { AuthenticatedUser } from '../common/auth/auth-user';
import { ensureUserHasSchoolAccess } from '../common/access/school-access.util';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';

@Injectable()
export class SchoolYearsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    this.ensureValidDateRange(startDate, endDate);

    return this.prisma.schoolYear.create({
      data: {
        schoolId: data.schoolId,
        name: data.name,
        startDate,
        endDate,
      },
      include: this.buildInclude(),
    });
  }

  findAllForSchool(user: AuthenticatedUser, schoolId: string) {
    ensureUserHasSchoolAccess(user, schoolId);

    return this.prisma.schoolYear.findMany({
      where: {
        schoolId,
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

    const nextStartDate = data.startDate
      ? new Date(data.startDate)
      : existing.startDate;
    const nextEndDate = data.endDate ? new Date(data.endDate) : existing.endDate;

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

    return this.prisma.schoolYear.update({
      where: { id },
      data: updateData,
      include: this.buildInclude(),
    });
  }

  async activate(user: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
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

      return tx.schoolYear.update({
        where: { id: existing.id },
        data: {
          isActive: true,
        },
        include: this.buildInclude(),
      });
    });
  }

  async archive(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.schoolYear.findUnique({
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

    return this.prisma.schoolYear.update({
      where: { id },
      data: {
        isActive: false,
      },
      include: this.buildInclude(),
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    try {
      const existing = await this.prisma.schoolYear.findUnique({
        where: { id },
        select: {
          id: true,
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

      const dependencyLabels: string[] = [
        ['classes', existing._count.classes],
        ['attendance sessions', existing._count.attendanceSessions],
        ['reporting periods', existing._count.reportingPeriods],
      ].flatMap(([label, count]: [string, number]) => (count > 0 ? [label] : []));

      if (dependencyLabels.length > 0) {
        throw new ConflictException(
          `School year cannot be deleted because related ${dependencyLabels.join(', ')} still exist`,
        );
      }

      await this.prisma.schoolYear.delete({
        where: { id: existing.id },
      });

      return {
        success: true,
      };
    } catch (error) {
      this.handleRemoveError(error);
    }
  }
}
