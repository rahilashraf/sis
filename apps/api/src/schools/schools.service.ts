import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.school.create({
      data: {
        name: data.name,
        shortName: data.shortName,
      },
    });
  }

  async update(user: AuthenticatedUser, schoolId: string, data: UpdateSchoolDto) {
    await this.getSchoolOrThrow(user, schoolId);

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

    return this.prisma.school.update({
      where: { id: schoolId },
      data: updateData,
    });
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

    return this.prisma.school.update({
      where: { id: schoolId },
      data: { isActive },
    });
  }

  async remove(user: AuthenticatedUser, schoolId: string) {
    const existingSchool = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
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

    return {
      success: true,
      removalMode: 'archived' as const,
      reason: `School was archived because related ${dependencyLabels.join(', ')} still exist`,
    };
  }
}
