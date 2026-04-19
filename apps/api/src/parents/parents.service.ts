import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  getAccessibleSchoolIds,
  isBypassRole,
  isSchoolAdminRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import { safeUserSelect } from '../common/prisma/safe-user-response';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  private isAdminLike(role: UserRole) {
    return isBypassRole(role) || isSchoolAdminRole(role);
  }

  private async getParentOrThrow(parentId: string) {
    const parent = await this.prisma.user.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        role: true,
        schoolId: true,
        memberships: {
          where: {
            isActive: true,
          },
          select: {
            schoolId: true,
          },
        },
      },
    });

    if (!parent || parent.role !== UserRole.PARENT) {
      throw new NotFoundException('Parent not found');
    }

    return parent;
  }

  async findStudents(actor: AuthenticatedUser, parentId: string) {
    if (actor.role === UserRole.PARENT) {
      if (actor.id !== parentId) {
        throw new ForbiddenException('You do not have parent access');
      }
    } else {
      if (!this.isAdminLike(actor.role)) {
        throw new ForbiddenException('You do not have parent access');
      }

      const parent = await this.getParentOrThrow(parentId);

      if (!isBypassRole(actor.role)) {
        const accessibleSchoolIds = new Set(getAccessibleSchoolIds(actor));
        const parentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
          memberships: parent.memberships,
          legacySchoolId: parent.schoolId,
        });
        const hasAccess = parentSchoolIds.some((schoolId) =>
          accessibleSchoolIds.has(schoolId),
        );

        if (!hasAccess) {
          throw new ForbiddenException('You do not have parent access');
        }
      }
    }

    return this.prisma.studentParentLink.findMany({
      where: { parentId },
      select: {
        id: true,
        parentId: true,
        studentId: true,
        createdAt: true,
        student: {
          select: safeUserSelect,
        },
      },
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
      ],
    });
  }
}
