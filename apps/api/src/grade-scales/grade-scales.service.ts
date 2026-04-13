import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import { ensureUserHasSchoolAccess, isHighPrivilegeRole } from '../common/access/school-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradeScaleDto } from './dto/create-grade-scale.dto';
import { CreateGradeScaleRuleDto } from './dto/create-grade-scale-rule.dto';
import { UpdateGradeScaleDto } from './dto/update-grade-scale.dto';
import { UpdateGradeScaleRuleDto } from './dto/update-grade-scale-rule.dto';

type AuthUser = AuthenticatedUser;

function isOverlap(
  left: { minPercent: number; maxPercent: number },
  right: { minPercent: number; maxPercent: number },
) {
  return left.minPercent <= right.maxPercent && right.minPercent <= left.maxPercent;
}

function isSchemaMissingError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

@Injectable()
export class GradeScalesService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureHighPrivilege(user: AuthUser) {
    if (!isHighPrivilegeRole(user.role)) {
      throw new ForbiddenException('You do not have grade scale access');
    }
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

  private normalizeName(value: string, field: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${field} is required`);
    }
    return trimmed;
  }

  private validateRange(minPercent: number, maxPercent: number) {
    if (!Number.isFinite(minPercent) || !Number.isFinite(maxPercent)) {
      throw new BadRequestException('Percent ranges must be valid numbers');
    }

    if (minPercent < 0 || maxPercent < 0 || minPercent > 100 || maxPercent > 100) {
      throw new BadRequestException('Percent ranges must be between 0 and 100');
    }

    if (minPercent > maxPercent) {
      throw new BadRequestException('minPercent must be less than or equal to maxPercent');
    }
  }

  private async getScaleOrThrow(id: string) {
    const scale = await this.prisma.gradeScale.findUnique({
      where: { id },
      select: { id: true, schoolId: true, isActive: true },
    });

    if (!scale) {
      throw new NotFoundException('Grade scale not found');
    }

    return scale;
  }

  private async getRuleOrThrow(id: string) {
    const rule = await this.prisma.gradeScaleRule.findUnique({
      where: { id },
      select: {
        id: true,
        gradeScaleId: true,
        minPercent: true,
        maxPercent: true,
      },
    });

    if (!rule) {
      throw new NotFoundException('Grade scale rule not found');
    }

    return rule;
  }

  private async ensureNoOverlap(gradeScaleId: string, next: { minPercent: number; maxPercent: number }, excludeRuleId?: string) {
    const existingRules = await this.prisma.gradeScaleRule.findMany({
      where: {
        gradeScaleId,
        ...(excludeRuleId ? { id: { not: excludeRuleId } } : {}),
      },
      select: {
        id: true,
        minPercent: true,
        maxPercent: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { minPercent: 'asc' }],
    });

    const overlapping = existingRules.find((rule) => isOverlap(rule, next));

    if (overlapping) {
      throw new ConflictException('Grade scale rules cannot overlap');
    }
  }

  async list(user: AuthUser, schoolId: string, options: { includeInactive?: boolean } = {}) {
    this.ensureHighPrivilege(user);
    ensureUserHasSchoolAccess(user, schoolId);
    await this.ensureSchoolExists(schoolId);

    const includeInactive = options.includeInactive ?? false;

    try {
      return await this.prisma.gradeScale.findMany({
        where: {
          schoolId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        include: {
          rules: {
            orderBy: [{ sortOrder: 'asc' }, { minPercent: 'asc' }],
          },
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        try {
          const scales = await this.prisma.gradeScale.findMany({
            where: {
              schoolId,
              ...(includeInactive ? {} : { isActive: true }),
            },
            orderBy: [{ name: 'asc' }],
          });

          return scales.map((scale) => ({ ...scale, rules: [] }));
        } catch (fallbackError) {
          if (isSchemaMissingError(fallbackError)) {
            throw new ServiceUnavailableException(
              'Grade scales are unavailable until database migrations are applied.',
            );
          }

          throw fallbackError;
        }
      }

      throw error;
    }
  }

  async create(user: AuthUser, data: CreateGradeScaleDto) {
    this.ensureHighPrivilege(user);
    ensureUserHasSchoolAccess(user, data.schoolId);
    await this.ensureSchoolExists(data.schoolId);

    const name = this.normalizeName(data.name, 'name');
    const isDefault = data.isDefault ?? false;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.gradeScale.create({
          data: {
            schoolId: data.schoolId,
            name,
            isDefault,
            isActive: true,
          },
        });

        if (isDefault) {
          await tx.gradeScale.updateMany({
            where: {
              schoolId: data.schoolId,
              id: { not: created.id },
              isDefault: true,
            },
            data: { isDefault: false },
          });
        }

        try {
          return await tx.gradeScale.findUnique({
            where: { id: created.id },
            include: {
              rules: { orderBy: [{ sortOrder: 'asc' }, { minPercent: 'asc' }] },
            },
          });
        } catch (includeError) {
          if (isSchemaMissingError(includeError)) {
            return { ...created, rules: [] };
          }

          throw includeError;
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A grade scale with this name already exists');
      }

      throw error;
    }
  }

  async update(user: AuthUser, id: string, data: UpdateGradeScaleDto) {
    this.ensureHighPrivilege(user);

    const existing = await this.getScaleOrThrow(id);
    ensureUserHasSchoolAccess(user, existing.schoolId);

    const updateData: Prisma.GradeScaleUpdateInput = {};

    if (data.name !== undefined) {
      updateData.name = this.normalizeName(data.name, 'name');
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    try {
      const updated = await this.prisma.gradeScale.update({
        where: { id: existing.id },
        data: updateData,
      });
      try {
        return await this.prisma.gradeScale.findUnique({
          where: { id: updated.id },
          include: {
            rules: { orderBy: [{ sortOrder: 'asc' }, { minPercent: 'asc' }] },
          },
        });
      } catch (includeError) {
        if (isSchemaMissingError(includeError)) {
          return { ...updated, rules: [] };
        }

        throw includeError;
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A grade scale with this name already exists');
      }

      throw error;
    }
  }

  async setDefault(user: AuthUser, id: string) {
    this.ensureHighPrivilege(user);
    const existing = await this.getScaleOrThrow(id);
    ensureUserHasSchoolAccess(user, existing.schoolId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gradeScale.update({
        where: { id: existing.id },
        data: { isDefault: true, isActive: true },
      });

      await tx.gradeScale.updateMany({
        where: {
          schoolId: existing.schoolId,
          id: { not: existing.id },
          isDefault: true,
        },
        data: { isDefault: false },
      });

      try {
        return await tx.gradeScale.findUnique({
          where: { id: updated.id },
          include: {
            rules: { orderBy: [{ sortOrder: 'asc' }, { minPercent: 'asc' }] },
          },
        });
      } catch (includeError) {
        if (isSchemaMissingError(includeError)) {
          return { ...updated, rules: [] };
        }

        throw includeError;
      }
    });
  }

  async setActive(user: AuthUser, id: string, isActive: boolean) {
    this.ensureHighPrivilege(user);
    const existing = await this.getScaleOrThrow(id);
    ensureUserHasSchoolAccess(user, existing.schoolId);

    const updated = await this.prisma.gradeScale.update({
      where: { id: existing.id },
      data: { isActive },
    });

    try {
      return await this.prisma.gradeScale.findUnique({
        where: { id: updated.id },
        include: {
          rules: { orderBy: [{ sortOrder: 'asc' }, { minPercent: 'asc' }] },
        },
      });
    } catch (includeError) {
      if (isSchemaMissingError(includeError)) {
        return { ...updated, rules: [] };
      }

      throw includeError;
    }
  }

  async addRule(user: AuthUser, gradeScaleId: string, data: CreateGradeScaleRuleDto) {
    this.ensureHighPrivilege(user);
    const scale = await this.getScaleOrThrow(gradeScaleId);
    ensureUserHasSchoolAccess(user, scale.schoolId);

    const letterGrade = this.normalizeName(data.letterGrade, 'letterGrade');
    this.validateRange(data.minPercent, data.maxPercent);
    await this.ensureNoOverlap(gradeScaleId, { minPercent: data.minPercent, maxPercent: data.maxPercent });

    return this.prisma.gradeScaleRule.create({
      data: {
        gradeScaleId,
        minPercent: data.minPercent,
        maxPercent: data.maxPercent,
        letterGrade,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async updateRule(user: AuthUser, ruleId: string, data: UpdateGradeScaleRuleDto) {
    this.ensureHighPrivilege(user);
    const existingRule = await this.getRuleOrThrow(ruleId);
    const scale = await this.getScaleOrThrow(existingRule.gradeScaleId);
    ensureUserHasSchoolAccess(user, scale.schoolId);

    const nextMin = data.minPercent ?? existingRule.minPercent;
    const nextMax = data.maxPercent ?? existingRule.maxPercent;
    this.validateRange(nextMin, nextMax);
    await this.ensureNoOverlap(existingRule.gradeScaleId, { minPercent: nextMin, maxPercent: nextMax }, existingRule.id);

    const updateData: Prisma.GradeScaleRuleUpdateInput = {
      minPercent: data.minPercent,
      maxPercent: data.maxPercent,
      sortOrder: data.sortOrder,
    };

    if (data.letterGrade !== undefined) {
      updateData.letterGrade = this.normalizeName(data.letterGrade, 'letterGrade');
    }

    if (Object.values(updateData).every((value) => value === undefined)) {
      throw new BadRequestException('No valid fields provided for update');
    }

    return this.prisma.gradeScaleRule.update({
      where: { id: existingRule.id },
      data: updateData,
    });
  }
}
