import {
  BadRequestException,
  ConflictException,
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
  isSchoolAdminRole,
} from '../common/access/school-access.util';

type AuthUser = AuthenticatedUser;

function isSchemaMissingError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

function isWindowOpen(now: Date, opensAt: Date, closesAt: Date) {
  return now >= opensAt && now <= closesAt;
}

@Injectable()
export class ReRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  private canManageWindows(role: UserRole) {
    return (
      role === UserRole.OWNER ||
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ADMIN
    );
  }

  private ensureUserCanManageWindows(user: AuthUser, schoolId: string) {
    if (!this.canManageWindows(user.role)) {
      throw new ForbiddenException('You do not have re-registration access');
    }

    if (!isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);
    }
  }

  private ensureUserCanReadWindow(user: AuthUser, schoolId: string) {
    if (user.role === UserRole.PARENT) {
      return;
    }

    if (isBypassRole(user.role) || isSchoolAdminRole(user.role)) {
      if (!isBypassRole(user.role)) {
        ensureUserHasSchoolAccess(user, schoolId);
      }
      return;
    }

    throw new ForbiddenException('You do not have re-registration access');
  }

  private async ensureSchoolYearMatchesSchoolOrThrow(schoolId: string, schoolYearId: string) {
    const year = await this.prisma.schoolYear.findUnique({
      where: { id: schoolYearId },
      select: { id: true, schoolId: true },
    });

    if (!year) {
      throw new NotFoundException('School year not found');
    }

    if (year.schoolId !== schoolId) {
      throw new BadRequestException('schoolYearId does not belong to schoolId');
    }
  }

  private parseDateTimeOrThrow(value: string, field: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid datetime`);
    }
    return parsed;
  }

  async getWindowStatus(
    user: AuthUser,
    schoolId: string,
    schoolYearId: string,
    now = new Date(),
  ) {
    this.ensureUserCanReadWindow(user, schoolId);

    let window:
      | {
          id: string;
          schoolId: string;
          schoolYearId: string;
          opensAt: Date;
          closesAt: Date;
          isActive: boolean;
          createdAt: Date;
          updatedAt: Date;
        }
      | null = null;

    try {
      window = await this.prisma.reRegistrationWindow.findFirst({
        where: {
          schoolId,
          schoolYearId,
          isActive: true,
        },
        orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          schoolId: true,
          schoolYearId: true,
          opensAt: true,
          closesAt: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return {
          now,
          window: null,
          isOpen: false,
          status: 'NOT_CONFIGURED' as const,
        };
      }

      throw error;
    }

    if (!window) {
      return {
        now,
        window: null,
        isOpen: false,
        status: 'NOT_CONFIGURED' as const,
      };
    }

    const open = isWindowOpen(now, window.opensAt, window.closesAt);

    return {
      now,
      window,
      isOpen: open,
      status: open ? ('OPEN' as const) : ('CLOSED' as const),
    };
  }

  async listWindows(user: AuthUser, schoolId: string, schoolYearId: string) {
    this.ensureUserCanManageWindows(user, schoolId);
    await this.ensureSchoolYearMatchesSchoolOrThrow(schoolId, schoolYearId);

    try {
      return await this.prisma.reRegistrationWindow.findMany({
        where: { schoolId, schoolYearId },
        orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return [];
      }

      throw error;
    }
  }

  async isReRegistrationOpenForSchool(
    schoolId: string,
    schoolYearId: string | null,
    now = new Date(),
  ) {
    try {
      const window = await this.prisma.reRegistrationWindow.findFirst({
        where: {
          schoolId,
          ...(schoolYearId ? { schoolYearId } : {}),
          isActive: true,
          opensAt: { lte: now },
          closesAt: { gte: now },
        },
        select: {
          id: true,
          opensAt: true,
          closesAt: true,
        },
        orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
      });

      return Boolean(window);
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return false;
      }

      throw error;
    }
  }

  async create(
    user: AuthUser,
    data: {
      schoolId: string;
      schoolYearId: string;
      opensAt: string;
      closesAt: string;
      isActive?: boolean;
    },
  ) {
    const schoolId = data.schoolId.trim();
    const schoolYearId = data.schoolYearId.trim();

    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    if (!schoolYearId) {
      throw new BadRequestException('schoolYearId is required');
    }

    this.ensureUserCanManageWindows(user, schoolId);
    await this.ensureSchoolYearMatchesSchoolOrThrow(schoolId, schoolYearId);

    const opensAt = this.parseDateTimeOrThrow(data.opensAt, 'opensAt');
    const closesAt = this.parseDateTimeOrThrow(data.closesAt, 'closesAt');

    if (opensAt >= closesAt) {
      throw new BadRequestException('opensAt must be before closesAt');
    }

    const isActive = data.isActive ?? true;

    if (isActive) {
      const existing = await this.prisma.reRegistrationWindow.findFirst({
        where: {
          schoolId,
          schoolYearId,
          isActive: true,
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException(
          'An active re-registration window already exists for this school year',
        );
      }
    }

    try {
      return await this.prisma.reRegistrationWindow.create({
        data: {
          schoolId,
          schoolYearId,
          opensAt,
          closesAt,
          isActive,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Re-registration migrations are required before managing windows. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  private async getWindowOrThrow(id: string) {
    const existing = await this.prisma.reRegistrationWindow.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Re-registration window not found');
    }

    return existing;
  }

  async update(
    user: AuthUser,
    id: string,
    data: { opensAt?: string; closesAt?: string; isActive?: boolean },
  ) {
    const existing = await this.getWindowOrThrow(id);
    this.ensureUserCanManageWindows(user, existing.schoolId);
    await this.ensureSchoolYearMatchesSchoolOrThrow(existing.schoolId, existing.schoolYearId);

    const opensAt = data.opensAt ? this.parseDateTimeOrThrow(data.opensAt, 'opensAt') : existing.opensAt;
    const closesAt = data.closesAt ? this.parseDateTimeOrThrow(data.closesAt, 'closesAt') : existing.closesAt;

    if (opensAt >= closesAt) {
      throw new BadRequestException('opensAt must be before closesAt');
    }

    const isActive = data.isActive ?? existing.isActive;

    if (isActive) {
      const conflict = await this.prisma.reRegistrationWindow.findFirst({
        where: {
          id: { not: existing.id },
          schoolId: existing.schoolId,
          schoolYearId: existing.schoolYearId,
          isActive: true,
        },
        select: { id: true },
      });

      if (conflict) {
        throw new ConflictException(
          'An active re-registration window already exists for this school year',
        );
      }
    }

    try {
      return await this.prisma.reRegistrationWindow.update({
        where: { id },
        data: {
          opensAt,
          closesAt,
          isActive,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Re-registration migrations are required before managing windows. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }
}
