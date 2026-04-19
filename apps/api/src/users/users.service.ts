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
import { ManageUserMembershipsDto } from './dto/manage-user-memberships.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
  isHighPrivilegeRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
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

    if (isBypassRole(actor.role)) {
      return existingUser;
    }

    if (isHighPrivilegeRole(existingUser.role)) {
      throw new ForbiddenException('You cannot manage this user');
    }

    const accessibleSchoolIds = new Set(getAccessibleSchoolIds(actor));
    const manageableSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: existingUser.memberships,
      legacySchoolId: existingUser.schoolId,
    });
    const hasSchoolAccess = manageableSchoolIds.some((schoolId) =>
      accessibleSchoolIds.has(schoolId),
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
    if (!isHighPrivilegeRole(actor.role) && isHighPrivilegeRole(targetRole)) {
      throw new ForbiddenException('You cannot assign this role');
    }
  }

  private getNormalizedRequestedSchoolIds(options: {
    schoolId?: string | null;
    schoolIds?: string[] | null;
  }) {
    const normalizedSchoolIds = new Set<string>();

    if (options.schoolId?.trim()) {
      normalizedSchoolIds.add(options.schoolId.trim());
    }

    for (const schoolId of options.schoolIds ?? []) {
      const normalizedSchoolId = schoolId.trim();
      if (normalizedSchoolId) {
        normalizedSchoolIds.add(normalizedSchoolId);
      }
    }

    return [...normalizedSchoolIds];
  }

  private async ensureSchoolsExistAndAccessible(
    actor: AuthenticatedUser,
    schoolIds: string[],
  ) {
    for (const schoolId of schoolIds) {
      if (!isBypassRole(actor.role)) {
        ensureUserHasSchoolAccess(actor, schoolId);
      }

      const school = await this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true },
      });

      if (!school) {
        throw new NotFoundException('School not found');
      }
    }
  }

  private resolvePrimarySchoolId(options: {
    primarySchoolId?: string | null;
    schoolIds: string[];
  }) {
    const normalizedPrimarySchoolId = options.primarySchoolId?.trim() || null;

    if (normalizedPrimarySchoolId && !options.schoolIds.includes(normalizedPrimarySchoolId)) {
      throw new BadRequestException('primarySchoolId must be included in schoolIds');
    }

    return normalizedPrimarySchoolId ?? options.schoolIds[0] ?? null;
  }

  findAll(
    user: AuthenticatedUser,
    options?: {
      includeInactive?: boolean;
      role?: string;
      gradeLevelId?: string;
      sort?: string;
    },
  ) {
    const includeInactive = options?.includeInactive ?? false;
    const roleFilter = options?.role?.trim() ?? '';
    const gradeLevelId = options?.gradeLevelId?.trim() ?? '';
    const sort = options?.sort?.trim() ?? '';

    const requestedRole = roleFilter
      ? (Object.values(UserRole).includes(roleFilter as UserRole)
          ? (roleFilter as UserRole)
          : null)
      : null;

    if (roleFilter && !requestedRole) {
      throw new BadRequestException('Invalid role filter');
    }

    if (gradeLevelId && requestedRole !== UserRole.STUDENT) {
      throw new BadRequestException('gradeLevelId filter requires role=STUDENT');
    }

    const accessibleSchoolIds = getAccessibleSchoolIds(user);
    const orderBy =
      sort === 'createdAt'
        ? [{ createdAt: 'desc' as const }]
        : [
            { lastName: 'asc' as const },
            { firstName: 'asc' as const },
            { createdAt: 'desc' as const },
          ];

    return this.prisma.user.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(requestedRole ? { role: requestedRole } : {}),
        ...(gradeLevelId ? { gradeLevelId } : {}),
        ...(isBypassRole(user.role)
          ? {}
          : {
              OR: [
                {
                  memberships: {
                    some: {
                      schoolId: {
                        in: accessibleSchoolIds,
                      },
                      ...(includeInactive
                        ? {}
                        : {
                            isActive: true,
                            school: {
                              isActive: true,
                            },
                          }),
                    },
                  },
                },
                {
                  schoolId: {
                    in: accessibleSchoolIds,
                  },
                },
              ],
            }),
      },
      orderBy,
      select: safeUserSelect,
    });
  }

  async create(user: AuthenticatedUser, data: CreateUserDto) {
    const { schoolId, schoolIds, password, ...userData } = data;
    const requestedSchoolIds = this.getNormalizedRequestedSchoolIds({
      schoolId,
      schoolIds,
    });

    this.ensureActorCanAssignRole(user, data.role);

    if (requestedSchoolIds.length === 0 && !isHighPrivilegeRole(user.role)) {
      throw new BadRequestException(
        'At least one school assignment is required for school-scoped user creation',
      );
    }

    await this.ensureSchoolsExistAndAccessible(user, requestedSchoolIds);
    const primarySchoolId = requestedSchoolIds[0] ?? null;

    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.user.create({
      data: {
        ...userData,
        passwordHash,
        school: primarySchoolId
          ? {
              connect: {
                id: primarySchoolId,
              },
            }
          : undefined,
        memberships: requestedSchoolIds.length
          ? {
              createMany: {
                data: requestedSchoolIds.map((membershipSchoolId) => ({
                  schoolId: membershipSchoolId,
                })),
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

  async setMemberships(
    actor: AuthenticatedUser,
    userId: string,
    data: ManageUserMembershipsDto,
  ) {
    const existingUser = await this.getManageableUserOrThrow(actor, userId);
    const normalizedSchoolIds = this.getNormalizedRequestedSchoolIds({
      schoolIds: data.schoolIds,
    });

    if (normalizedSchoolIds.length === 0 && !isHighPrivilegeRole(actor.role)) {
      throw new BadRequestException(
        'At least one school assignment is required for school-scoped users',
      );
    }

    await this.ensureSchoolsExistAndAccessible(actor, normalizedSchoolIds);
    const primarySchoolId = this.resolvePrimarySchoolId({
      primarySchoolId: data.primarySchoolId,
      schoolIds: normalizedSchoolIds,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.userSchoolMembership.updateMany({
        where: {
          userId: existingUser.id,
          schoolId: {
            notIn: normalizedSchoolIds,
          },
        },
        data: {
          isActive: false,
        },
      });

      for (const schoolId of normalizedSchoolIds) {
        await tx.userSchoolMembership.upsert({
          where: {
            userId_schoolId: {
              userId: existingUser.id,
              schoolId,
            },
          },
          update: {
            isActive: true,
          },
          create: {
            userId: existingUser.id,
            schoolId,
            isActive: true,
          },
        });
      }

      await tx.user.update({
        where: { id: existingUser.id },
        data: {
          schoolId: primarySchoolId,
        },
      });
    });

    return this.prisma.user.findUniqueOrThrow({
      where: { id: existingUser.id },
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

    if (isHighPrivilegeRole(existingUser.role)) {
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

    if (dependencyLabels.length === 0) {
      await this.prisma.user.delete({
        where: { id: existingUser.id },
      });

      return {
        success: true,
        removalMode: 'deleted' as const,
      };
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          isActive: false,
        },
      }),
      this.prisma.userSchoolMembership.updateMany({
        where: {
          userId: existingUser.id,
        },
        data: {
          isActive: false,
        },
      }),
    ]);

    return {
      success: true,
      removalMode: 'deactivated' as const,
      reason: `User was deactivated because related ${dependencyLabels.join(', ')} still exist`,
    };
  }
}
