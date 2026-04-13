import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { safeUserSelect } from '../common/prisma/safe-user-response';

@Injectable()
export class LinksService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly duplicateLinkMessage =
    'Student is already linked to this parent';

  private async getUserMembershipSchoolIds(userId: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
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

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    return {
      role: existingUser.role,
      schoolIds: existingUser.memberships.map(
        (membership) => membership.schoolId,
      ),
    };
  }

  private isDuplicateLinkError(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== 'P2002') {
      return false;
    }

    const target = Array.isArray(error.meta?.target) ? error.meta.target : [];

    return target.includes('parentId') && target.includes('studentId');
  }

  private rethrowDuplicateLinkError(error: unknown): never {
    if (this.isDuplicateLinkError(error)) {
      throw new ConflictException(this.duplicateLinkMessage);
    }

    throw error;
  }

  private ensureActorCanAccessLinkedSchools(
    actor: AuthenticatedUser,
    schoolIds: string[],
  ) {
    if (isBypassRole(actor.role)) {
      return;
    }

    const accessibleSchoolIds = new Set(getAccessibleSchoolIds(actor));
    const hasAccess = schoolIds.some((schoolId) =>
      accessibleSchoolIds.has(schoolId),
    );

    if (!hasAccess) {
      throw new ForbiddenException('You do not have school access');
    }
  }

  private buildLinkSelect() {
    return {
      id: true,
      parentId: true,
      studentId: true,
      createdAt: true,
      parent: {
        select: safeUserSelect,
      },
      student: {
        select: safeUserSelect,
      },
    } as const;
  }

  async create(actor: AuthenticatedUser, data: CreateLinkDto) {
    if (data.parentId === data.studentId) {
      throw new BadRequestException(
        'parentId and studentId must refer to different users',
      );
    }

    const parent = await this.getUserMembershipSchoolIds(data.parentId);
    const student = await this.getUserMembershipSchoolIds(data.studentId);

    if (parent.role !== 'PARENT') {
      throw new BadRequestException('parentId must belong to a parent user');
    }

    if (student.role !== 'STUDENT') {
      throw new BadRequestException('studentId must belong to a student user');
    }

    if (parent.schoolIds.length === 0) {
      throw new BadRequestException(
        'parentId must belong to a parent with an active school membership',
      );
    }

    if (student.schoolIds.length === 0) {
      throw new BadRequestException(
        'studentId must belong to a student with an active school membership',
      );
    }

    const sharedSchoolIds = parent.schoolIds.filter((schoolId) =>
      student.schoolIds.includes(schoolId),
    );

    if (sharedSchoolIds.length === 0) {
      throw new BadRequestException(
        'Parent and student must belong to at least one common school',
      );
    }

    this.ensureActorCanAccessLinkedSchools(actor, sharedSchoolIds);

    try {
      return await this.prisma.studentParentLink.create({
        data,
        select: this.buildLinkSelect(),
      });
    } catch (error) {
      this.rethrowDuplicateLinkError(error);
    }
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const existingLink = await this.prisma.studentParentLink.findUnique({
      where: { id },
      select: {
        id: true,
        parent: {
          select: {
            memberships: {
              where: {
                isActive: true,
              },
              select: {
                schoolId: true,
              },
            },
          },
        },
        student: {
          select: {
            memberships: {
              where: {
                isActive: true,
              },
              select: {
                schoolId: true,
              },
            },
          },
        },
      },
    });

    if (!existingLink) {
      throw new NotFoundException('Student-parent link not found');
    }

    const linkedSchoolIds = [
      ...new Set([
        ...existingLink.parent.memberships.map((membership) => membership.schoolId),
        ...existingLink.student.memberships.map(
          (membership) => membership.schoolId,
        ),
      ]),
    ];

    this.ensureActorCanAccessLinkedSchools(actor, linkedSchoolIds);

    return this.prisma.studentParentLink.delete({
      where: { id },
      select: {
        id: true,
        parentId: true,
        studentId: true,
        createdAt: true,
      },
    });
  }
}
