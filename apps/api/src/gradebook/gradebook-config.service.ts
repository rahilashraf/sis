import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GradebookWeightingMode, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  isBypassRole,
  isSchoolAdminRole,
  isTeacherRole,
} from '../common/access/school-access.util';

type AuthUser = AuthenticatedUser;

function isSchemaMissingError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

function isUnknownFieldError(error: unknown, fieldName: string) {
  return (
    error instanceof Error &&
    typeof error.message === 'string' &&
    error.message.includes(`Unknown field \`${fieldName}\``)
  );
}

@Injectable()
export class GradebookConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private isAdminLike(role: UserRole) {
    return isBypassRole(role) || isSchoolAdminRole(role);
  }

  private isTeacherLike(role: UserRole) {
    return isTeacherRole(role);
  }

  private async ensureTeacherAssignedToClass(teacherId: string, classId: string) {
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: { teacherId, classId },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have class access');
    }
  }

  private async getClassContextOrThrow(classId: string) {
    try {
      const existingClass = await this.prisma.class.findUnique({
        where: { id: classId },
        select: {
          id: true,
          schoolId: true,
          schoolYearId: true,
          gradebookWeightingMode: true,
        },
      });

      if (!existingClass) {
        throw new NotFoundException('Class not found');
      }

      return existingClass;
    } catch (error) {
      if (isSchemaMissingError(error) || isUnknownFieldError(error, 'gradebookWeightingMode')) {
        const existingClass = await this.prisma.class.findUnique({
          where: { id: classId },
          select: {
            id: true,
            schoolId: true,
            schoolYearId: true,
          },
        });

        if (!existingClass) {
          throw new NotFoundException('Class not found');
        }

        return { ...existingClass, gradebookWeightingMode: GradebookWeightingMode.UNWEIGHTED };
      }

      throw error;
    }
  }

  private async ensureUserCanManageClass(user: AuthUser, classId: string) {
    const classContext = await this.getClassContextOrThrow(classId);

    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, classContext.schoolId);
      return classContext;
    }

    if (this.isTeacherLike(user.role)) {
      await this.ensureTeacherAssignedToClass(user.id, classId);
      return classContext;
    }

    throw new ForbiddenException('You do not have class access');
  }

  async getSettings(user: AuthUser, classId: string) {
    const classContext = await this.ensureUserCanManageClass(user, classId);

    return {
      classId: classContext.id,
      schoolId: classContext.schoolId,
      schoolYearId: classContext.schoolYearId,
      weightingMode: classContext.gradebookWeightingMode,
    };
  }

  async updateSettings(
    user: AuthUser,
    classId: string,
    data: { weightingMode?: GradebookWeightingMode },
  ) {
    await this.ensureUserCanManageClass(user, classId);

    if (data.weightingMode === undefined) {
      throw new BadRequestException('weightingMode is required');
    }

    if (data.weightingMode === GradebookWeightingMode.CATEGORY_WEIGHTED) {
      const categories = await this.prisma.assessmentCategory.findMany({
        where: { classId, isActive: true },
        select: { id: true },
      });

      if (categories.length === 0) {
        throw new BadRequestException('At least one active category is required for category weighting');
      }

      const uncategorized = await this.prisma.assessment.findFirst({
        where: { classId, isActive: true, categoryId: null },
        select: { id: true },
      });

      if (uncategorized) {
        throw new BadRequestException('Assign categories to all active assessments before enabling category weighting');
      }
    }

    try {
      const updated = await this.prisma.class.update({
        where: { id: classId },
        data: {
          gradebookWeightingMode: data.weightingMode,
        },
        select: {
          id: true,
          gradebookWeightingMode: true,
        },
      });

      return {
        classId: updated.id,
        weightingMode: updated.gradebookWeightingMode,
      };
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Gradebook-weighting migrations are required before using calculation modes. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  async listCategories(user: AuthUser, classId: string, includeInactive = false) {
    await this.ensureUserCanManageClass(user, classId);

    try {
      return await this.prisma.assessmentCategory.findMany({
        where: {
          classId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return [];
      }

      throw error;
    }
  }

  async createCategory(
    user: AuthUser,
    classId: string,
    data: { name: string; sortOrder?: number; weight?: number | null },
  ) {
    await this.ensureUserCanManageClass(user, classId);

    const name = data.name.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }

    try {
      return await this.prisma.assessmentCategory.create({
        data: {
          classId,
          name,
          sortOrder: data.sortOrder ?? 0,
          weight: data.weight ?? 1,
          isActive: true,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Category-weighting migrations are required before using assessment categories. Apply the latest Prisma migrations and try again.',
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('A category with this name already exists for the class');
      }

      throw error;
    }
  }

  private async getCategoryOrThrow(categoryId: string) {
    const category = await this.prisma.assessmentCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, classId: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async updateCategory(
    user: AuthUser,
    categoryId: string,
    data: { name?: string; sortOrder?: number; weight?: number | null; isActive?: boolean },
  ) {
    const category = await this.getCategoryOrThrow(categoryId);
    await this.ensureUserCanManageClass(user, category.classId);

    const updateData: Prisma.AssessmentCategoryUpdateInput = {};

    if (data.name !== undefined) {
      const nextName = data.name.trim();
      if (!nextName) {
        throw new BadRequestException('name cannot be empty');
      }
      updateData.name = nextName;
    }

    if (data.sortOrder !== undefined) {
      updateData.sortOrder = data.sortOrder;
    }

    if (data.weight !== undefined) {
      updateData.weight = data.weight;
    }

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    try {
      return await this.prisma.assessmentCategory.update({
        where: { id: categoryId },
        data: updateData,
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Category-weighting migrations are required before using assessment categories. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }
}
