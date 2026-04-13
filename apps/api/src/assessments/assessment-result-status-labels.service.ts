import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResultCalculationBehavior, UserRole } from '@prisma/client';
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

const systemLabels = [
  {
    key: 'COMPLETED',
    label: 'Completed',
    behavior: ResultCalculationBehavior.INFORMATION_ONLY,
    sortOrder: 5,
  },
  {
    key: 'LATE',
    label: 'Late',
    behavior: ResultCalculationBehavior.INFORMATION_ONLY,
    sortOrder: 10,
  },
  {
    key: 'ABSENT',
    label: 'Absent',
    behavior: ResultCalculationBehavior.COUNT_AS_ZERO,
    sortOrder: 20,
  },
  {
    key: 'EXEMPT',
    label: 'Exempt',
    behavior: ResultCalculationBehavior.EXCLUDE_FROM_CALCULATION,
    sortOrder: 30,
  },
  {
    key: 'MISSING',
    label: 'Missing',
    behavior: ResultCalculationBehavior.COUNT_AS_ZERO,
    sortOrder: 40,
  },
] as const;

@Injectable()
export class AssessmentResultStatusLabelsService {
  constructor(private readonly prisma: PrismaService) {}

  private canRead(user: AuthUser) {
    return isBypassRole(user.role) || isSchoolAdminRole(user.role) || isTeacherRole(user.role);
  }

  private ensureCanWrite(user: AuthUser, schoolId: string) {
    if (!isHighPrivilegeRole(user.role)) {
      throw new ForbiddenException('You do not have status label access');
    }

    if (!isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);
    }
  }

  private async ensureSystemLabelsExist(schoolId: string) {
    try {
      const existing = await this.prisma.assessmentResultStatusLabel.findMany({
        where: { schoolId, isSystem: true, key: { in: systemLabels.map((entry) => entry.key) } },
        select: { key: true },
      });

      const existingKeys = new Set(existing.map((entry) => entry.key));
      const toCreate = systemLabels
        .filter((entry) => !existingKeys.has(entry.key))
        .map((entry) => ({
          schoolId,
          key: entry.key,
          label: entry.label,
          behavior: entry.behavior,
          sortOrder: entry.sortOrder,
          isSystem: true,
          isActive: true,
        }));

      if (toCreate.length === 0) {
        return;
      }

      await this.prisma.assessmentResultStatusLabel.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return;
      }

      throw error;
    }
  }

  async list(
    user: AuthUser,
    options: { schoolId: string; includeInactive?: boolean },
  ) {
    if (!this.canRead(user)) {
      throw new ForbiddenException('You do not have status label access');
    }

    const schoolId = options.schoolId.trim();
    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    if (!isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);
    }

    await this.ensureSystemLabelsExist(schoolId);

    try {
      return await this.prisma.assessmentResultStatusLabel.findMany({
        where: {
          schoolId,
          ...(options.includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return [];
      }

      throw error;
    }
  }

  async create(
    user: AuthUser,
    data: {
      schoolId: string;
      key?: string;
      label: string;
      behavior?: ResultCalculationBehavior;
      sortOrder?: number;
    },
  ) {
    const schoolId = data.schoolId.trim();
    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    this.ensureCanWrite(user, schoolId);

    const label = data.label.trim();
    if (!label) {
      throw new BadRequestException('label is required');
    }

    const baseKey = normalizeKey(data.key?.trim() || label) || `CODE_${Date.now()}`;
    const keyCandidates = [
      baseKey,
      `${baseKey}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      `${baseKey}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    ];

    for (const key of keyCandidates) {
      try {
        return await this.prisma.assessmentResultStatusLabel.create({
          data: {
            schoolId,
            key,
            label,
            behavior: data.behavior ?? ResultCalculationBehavior.INFORMATION_ONLY,
            sortOrder: data.sortOrder ?? 0,
            isSystem: false,
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
          throw new BadRequestException('Status labels are not available yet');
        }

        throw error;
      }
    }

    throw new BadRequestException('Unable to generate a unique status label key');
  }

  private async getLabelOrThrow(id: string) {
    const record = await this.prisma.assessmentResultStatusLabel.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('Status label not found');
    }

    return record;
  }

  async update(
    user: AuthUser,
    id: string,
    data: {
      label?: string;
      behavior?: ResultCalculationBehavior;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.getLabelOrThrow(id);
    this.ensureCanWrite(user, existing.schoolId);

    const updateData: Prisma.AssessmentResultStatusLabelUpdateInput = {};

    if (data.label !== undefined) {
      const nextLabel = data.label.trim();
      if (!nextLabel) {
        throw new BadRequestException('label cannot be empty');
      }
      updateData.label = nextLabel;
    }

    if (data.behavior !== undefined) {
      updateData.behavior = data.behavior;
    }

    if (data.sortOrder !== undefined) {
      updateData.sortOrder = data.sortOrder;
    }

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    return this.prisma.assessmentResultStatusLabel.update({
      where: { id },
      data: updateData,
    });
  }
}
