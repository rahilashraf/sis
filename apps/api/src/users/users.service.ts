import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { AppUserRole, CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { safeUserSelect } from '../common/prisma/safe-user-response';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async getManageableUserOrThrow(
    actor: AuthenticatedUser,
    userId: string,
  ) {
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

    if (isBypassRole(actor.role)) {
      return existingUser;
    }

    if (isBypassRole(existingUser.role)) {
      throw new ForbiddenException('You cannot manage this user');
    }

    const accessibleSchoolIds = new Set(getAccessibleSchoolIds(actor));
    const hasSchoolAccess = existingUser.memberships.some((membership) =>
      accessibleSchoolIds.has(membership.schoolId),
    );

    if (!hasSchoolAccess) {
      throw new ForbiddenException('You do not have user access');
    }

    return existingUser;
  }

  private ensureActorCanAssignRole(
    actor: AuthenticatedUser,
    targetRole: AppUserRole | UserRole,
  ) {
    if (!isBypassRole(actor.role) && isBypassRole(targetRole)) {
      throw new ForbiddenException('You cannot assign this role');
    }
  }

  findAll(user: AuthenticatedUser) {
    const accessibleSchoolIds = getAccessibleSchoolIds(user);

    return this.prisma.user.findMany({
      where: isBypassRole(user.role)
        ? undefined
        : {
            memberships: {
              some: {
                schoolId: {
                  in: accessibleSchoolIds,
                },
                isActive: true,
              },
            },
          },
      orderBy: { createdAt: 'desc' },
      select: safeUserSelect,
    });
  }

  async create(user: AuthenticatedUser, data: CreateUserDto) {
    const { schoolId, password, ...userData } = data;

    this.ensureActorCanAssignRole(user, data.role);

    if (!schoolId && !isBypassRole(user.role)) {
      throw new BadRequestException(
        'schoolId is required for school-scoped user creation',
      );
    }

    if (schoolId) {
      ensureUserHasSchoolAccess(user, schoolId);

      const school = await this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true },
      });

      if (!school) {
        throw new NotFoundException('School not found');
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.user.create({
      data: {
        ...userData,
        passwordHash,
        memberships: schoolId
          ? {
              create: {
                schoolId,
              },
            }
          : undefined,
      },
      select: safeUserSelect,
    });
  }

  async update(user: AuthenticatedUser, userId: string, data: UpdateUserDto) {
    const existingUser = await this.getManageableUserOrThrow(user, userId);

    if (data.role) {
      this.ensureActorCanAssignRole(user, data.role);
    }

    const updateData: {
      username?: string;
      email?: string | null;
      firstName?: string;
      lastName?: string;
      role?: AppUserRole;
      isActive?: boolean;
      passwordHash?: string;
    } = {};

    if (data.username !== undefined) {
      updateData.username = data.username;
    }

    if (data.email !== undefined) {
      updateData.email = data.email;
    }

    if (data.firstName !== undefined) {
      updateData.firstName = data.firstName;
    }

    if (data.lastName !== undefined) {
      updateData.lastName = data.lastName;
    }

    if (data.role !== undefined) {
      updateData.role = data.role;
    }

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    if (
      !isBypassRole(user.role) &&
      existingUser.memberships.length === 0 &&
      user.id !== existingUser.id
    ) {
      throw new ForbiddenException('You do not have user access');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: safeUserSelect,
    });
  }

  async remove(actor: AuthenticatedUser, userId: string) {
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
        _count: {
          select: {
            parentLinks: true,
            studentLinks: true,
            teacherClasses: true,
            studentClasses: true,
            takenAttendanceSessions: true,
            attendanceRecords: true,
            studentGradeRecords: true,
          },
        },
      },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    if (actor.id === existingUser.id) {
      throw new ConflictException('You cannot delete your own account');
    }

    if (isBypassRole(existingUser.role)) {
      throw new ConflictException('High-privilege users cannot be deleted');
    }

    await this.getManageableUserOrThrow(actor, userId);

    const dependencyLabels: string[] = [
      ['parent links', existingUser._count.parentLinks],
      ['student links', existingUser._count.studentLinks],
      ['teacher assignments', existingUser._count.teacherClasses],
      ['class enrollments', existingUser._count.studentClasses],
      ['attendance sessions', existingUser._count.takenAttendanceSessions],
      ['attendance records', existingUser._count.attendanceRecords],
      ['grade records', existingUser._count.studentGradeRecords],
    ].flatMap(([label, count]: [string, number]) => (count > 0 ? [label] : []));

    if (dependencyLabels.length > 0) {
      throw new ConflictException(
        `User cannot be deleted because related ${dependencyLabels.join(', ')} still exist`,
      );
    }

    await this.prisma.user.delete({
      where: { id: existingUser.id },
    });

    return {
      success: true,
    };
  }
}
