import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import { ensureUserHasSchoolAccess } from '../common/access/school-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradeLevelDto } from './dto/create-grade-level.dto';
import { UpdateGradeLevelDto } from './dto/update-grade-level.dto';

@Injectable()
export class GradeLevelsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildInclude() {
    return {
      school: true,
      _count: {
        select: {
          students: true,
        },
      },
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

  private async getGradeLevelOrThrow(id: string) {
    const gradeLevel = await this.prisma.gradeLevel.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        isActive: true,
      },
    });

    if (!gradeLevel) {
      throw new NotFoundException('Grade level not found');
    }

    return gradeLevel;
  }

  private handleDuplicateName(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'A grade level with this name already exists for the selected school',
      );
    }

    throw error;
  }

  async create(user: AuthenticatedUser, data: CreateGradeLevelDto) {
    ensureUserHasSchoolAccess(user, data.schoolId);
    await this.ensureSchoolExists(data.schoolId);

    try {
      return await this.prisma.gradeLevel.create({
        data: {
          schoolId: data.schoolId,
          name: data.name.trim(),
          sortOrder: data.sortOrder ?? 0,
        },
        include: this.buildInclude(),
      });
    } catch (error) {
      this.handleDuplicateName(error);
    }
  }

  findAllForSchool(
    user: AuthenticatedUser,
    schoolId: string,
    includeInactive = false,
  ) {
    ensureUserHasSchoolAccess(user, schoolId);

    return this.prisma.gradeLevel.findMany({
      where: {
        schoolId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: this.buildInclude(),
    });
  }

  async update(user: AuthenticatedUser, id: string, data: UpdateGradeLevelDto) {
    const existing = await this.getGradeLevelOrThrow(id);
    ensureUserHasSchoolAccess(user, existing.schoolId);

    const updateData: Prisma.GradeLevelUpdateInput = {};

    if (data.name !== undefined) {
      const trimmedName = data.name.trim();

      if (!trimmedName) {
        throw new BadRequestException('name is required');
      }

      updateData.name = trimmedName;
    }

    if (data.sortOrder !== undefined) {
      updateData.sortOrder = data.sortOrder;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    try {
      return await this.prisma.gradeLevel.update({
        where: { id },
        data: updateData,
        include: this.buildInclude(),
      });
    } catch (error) {
      this.handleDuplicateName(error);
    }
  }

  async archive(user: AuthenticatedUser, id: string) {
    const existing = await this.getGradeLevelOrThrow(id);
    ensureUserHasSchoolAccess(user, existing.schoolId);

    return this.prisma.gradeLevel.update({
      where: { id },
      data: {
        isActive: false,
      },
      include: this.buildInclude(),
    });
  }

  async activate(user: AuthenticatedUser, id: string) {
    const existing = await this.getGradeLevelOrThrow(id);
    ensureUserHasSchoolAccess(user, existing.schoolId);

    return this.prisma.gradeLevel.update({
      where: { id },
      data: {
        isActive: true,
      },
      include: this.buildInclude(),
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    const gradeLevel = await this.prisma.gradeLevel.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        _count: {
          select: {
            students: true,
          },
        },
      },
    });

    if (!gradeLevel) {
      throw new NotFoundException('Grade level not found');
    }

    ensureUserHasSchoolAccess(user, gradeLevel.schoolId);

    if (gradeLevel._count.students === 0) {
      await this.prisma.gradeLevel.delete({ where: { id: gradeLevel.id } });
      return { success: true, removalMode: 'deleted' as const };
    }

    await this.prisma.gradeLevel.update({
      where: { id: gradeLevel.id },
      data: { isActive: false },
    });

    return { success: true, removalMode: 'archived' as const };
  }
}
