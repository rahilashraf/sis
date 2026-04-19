import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import { safeUserSelect } from '../common/prisma/safe-user-response';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private readonly duplicateLinkMessage =
    'Student is already linked to this parent';

  private async getUserMembershipSchoolIds(userId: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
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

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    return {
      role: existingUser.role,
      schoolIds: getAccessibleSchoolIdsWithLegacyFallback({
        memberships: existingUser.memberships,
        legacySchoolId: existingUser.schoolId,
      }),
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
      const created = await this.prisma.studentParentLink.create({
        data,
        select: this.buildLinkSelect(),
      });

      await this.auditService.log({
        actor,
        schoolId: sharedSchoolIds[0] ?? null,
        entityType: 'StudentParentLink',
        entityId: created.id,
        action: 'CREATE',
        severity: AuditLogSeverity.INFO,
        summary: `Linked parent ${created.parentId} to student ${created.studentId}`,
      });

      return created;
    } catch (error) {
      this.rethrowDuplicateLinkError(error);
    }
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const existingLink = await this.prisma.studentParentLink.findUnique({
      where: { id },
      select: {
        id: true,
        parentId: true,
        studentId: true,
        parent: {
          select: {
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
        },
        student: {
          select: {
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
        },
      },
    });

    if (!existingLink) {
      throw new NotFoundException('Student-parent link not found');
    }

    const linkedSchoolIds = [
      ...new Set([
        ...getAccessibleSchoolIdsWithLegacyFallback({
          memberships: existingLink.parent.memberships,
          legacySchoolId: existingLink.parent.schoolId,
        }),
        ...getAccessibleSchoolIdsWithLegacyFallback({
          memberships: existingLink.student.memberships,
          legacySchoolId: existingLink.student.schoolId,
        }),
      ]),
    ];

    this.ensureActorCanAccessLinkedSchools(actor, linkedSchoolIds);

    const deleted = await this.prisma.studentParentLink.delete({
      where: { id },
      select: {
        id: true,
        parentId: true,
        studentId: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      actor,
      schoolId: linkedSchoolIds[0] ?? null,
      entityType: 'StudentParentLink',
      entityId: deleted.id,
      action: 'DELETE',
      severity: AuditLogSeverity.WARNING,
      summary: `Removed parent-student link parent=${deleted.parentId} student=${deleted.studentId}`,
    });

    return deleted;
  }
}
