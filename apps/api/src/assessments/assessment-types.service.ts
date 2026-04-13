import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  isBypassRole,
  isHighPrivilegeRole,
  isSchoolAdminRole,
  isTeacherRole,
} from '../common/access/school-access.util';

type AuthUser = AuthenticatedUser;

function normalizeKey(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  return trimmed
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

function isSchemaMissingError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

@Injectable()
export class AssessmentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private isAdminLike(role: UserRole) {
    return isBypassRole(role) || isSchoolAdminRole(role);
  }

  private isTeacherLike(role: UserRole) {
    return isTeacherRole(role);
  }

  async list(
    user: AuthUser,
    options: { schoolId?: string; includeInactive?: boolean } = {},
  ) {
    if (!this.isAdminLike(user.role) && !this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have assessment type access');
    }

    const schoolId = options.schoolId?.trim() || undefined;

    if (schoolId && !isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);
    }

    const includeInactive = options.includeInactive ?? false;

    const schoolScopeWhere = schoolId
      ? {
          OR: [{ schoolId: null }, { schoolId }],
        }
      : { schoolId: null };

    try {
      return await this.prisma.assessmentType.findMany({
        where: {
          ...schoolScopeWhere,
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

  async create(user: AuthUser, data: { schoolId?: string | null; name: string; sortOrder?: number }) {
    if (!isHighPrivilegeRole(user.role)) {
      throw new ForbiddenException('You do not have assessment type access');
    }

    const schoolId = data.schoolId?.trim() || null;

    if (schoolId && !isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);
    }

    if (!schoolId && !isBypassRole(user.role)) {
      throw new BadRequestException('schoolId is required');
    }

    const name = data.name.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }

    const baseKey = normalizeKey(name) || `TYPE_${Date.now()}`;

    const keyCandidates = [
      baseKey,
      `${baseKey}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      `${baseKey}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    ];

    for (const key of keyCandidates) {
      try {
        return await this.prisma.assessmentType.create({
          data: {
            key,
            schoolId,
            name,
            sortOrder: data.sortOrder ?? 0,
            isActive: true,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }

        if (isSchemaMissingError(error)) {
          throw new BadRequestException('Assessment types are not available yet');
        }

        throw error;
      }
    }

    throw new BadRequestException('Unable to generate a unique assessment type key');
  }

  private async getTypeOrThrow(id: string) {
    const record = await this.prisma.assessmentType.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('Assessment type not found');
    }

    return record;
  }

  private ensureUserCanManageType(user: AuthUser, type: { schoolId: string | null }) {
    if (!isHighPrivilegeRole(user.role)) {
      throw new ForbiddenException('You do not have assessment type access');
    }

    if (type.schoolId && !isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, type.schoolId);
    }
  }

  async update(user: AuthUser, id: string, data: { name?: string; sortOrder?: number }) {
    const type = await this.getTypeOrThrow(id);
    this.ensureUserCanManageType(user, type);

    const updateData: Prisma.AssessmentTypeUpdateInput = {};

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

    return this.prisma.assessmentType.update({
      where: { id },
      data: updateData,
    });
  }

  async archive(user: AuthUser, id: string) {
    const type = await this.getTypeOrThrow(id);
    this.ensureUserCanManageType(user, type);

    return this.prisma.assessmentType.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async activate(user: AuthUser, id: string) {
    const type = await this.getTypeOrThrow(id);
    this.ensureUserCanManageType(user, type);

    return this.prisma.assessmentType.update({
      where: { id },
      data: { isActive: true },
    });
  }
}
