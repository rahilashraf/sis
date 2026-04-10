import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  async create(actor: AuthenticatedUser, data: CreateLinkDto) {
    const parent = await this.getUserMembershipSchoolIds(data.parentId);
    const student = await this.getUserMembershipSchoolIds(data.studentId);

    if (parent.role !== 'PARENT') {
      throw new BadRequestException('parentId must belong to a parent user');
    }

    if (student.role !== 'STUDENT') {
      throw new BadRequestException('studentId must belong to a student user');
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

    return this.prisma.studentParentLink.create({
      data,
      select: {
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
      },
    });
  }

  async findByParent(actor: AuthenticatedUser, parentId: string) {
    const parent = await this.getUserMembershipSchoolIds(parentId);
    this.ensureActorCanAccessLinkedSchools(actor, parent.schoolIds);

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
    });
  }

  async findByStudent(actor: AuthenticatedUser, studentId: string) {
    const student = await this.getUserMembershipSchoolIds(studentId);
    this.ensureActorCanAccessLinkedSchools(actor, student.schoolIds);

    return this.prisma.studentParentLink.findMany({
      where: { studentId },
      select: {
        id: true,
        parentId: true,
        studentId: true,
        createdAt: true,
        parent: {
          select: safeUserSelect,
        },
      },
    });
  }

  remove(id: string) {
    return this.prisma.studentParentLink.delete({
      where: { id },
    });
  }
}
