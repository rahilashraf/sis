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
  isTeacherRole,
} from '../common/access/school-access.util';

type AuthUser = AuthenticatedUser;

function isSchemaMissingError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

@Injectable()
export class GradeOverridesService {
  constructor(private readonly prisma: PrismaService) {}

  private isAdminLike(role: UserRole) {
    return isBypassRole(role) || isSchoolAdminRole(role);
  }

  private isTeacherLike(role: UserRole) {
    return isTeacherRole(role);
  }

  private async ensureTeacherAssignedToClass(teacherId: string, classId: string) {
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: { teacherId, classId },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have class access');
    }
  }

  private async ensureStudentEnrolledInClass(studentId: string, classId: string) {
    const enrollment = await this.prisma.studentClassEnrollment.findFirst({
      where: { studentId, classId },
      select: { id: true },
    });

    if (!enrollment) {
      throw new BadRequestException('Student is not enrolled in this class');
    }
  }

  private async getClassContextOrThrow(classId: string) {
    const existingClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, schoolId: true },
    });

    if (!existingClass) {
      throw new NotFoundException('Class not found');
    }

    return existingClass;
  }

  private async ensureUserCanManageClass(user: AuthUser, classId: string) {
    const existingClass = await this.getClassContextOrThrow(classId);

    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, existingClass.schoolId);
      return;
    }

    if (this.isTeacherLike(user.role)) {
      await this.ensureTeacherAssignedToClass(user.id, classId);
      return;
    }

    throw new ForbiddenException('You do not have class access');
  }

  async find(
    user: AuthUser,
    classId: string,
    studentId: string,
    reportingPeriodId: string | null,
  ) {
    await this.ensureUserCanManageClass(user, classId);
    await this.ensureStudentEnrolledInClass(studentId, classId);

    try {
      const record = await this.prisma.gradeOverride.findFirst({
        where: {
          classId,
          studentId,
          reportingPeriodId: reportingPeriodId ?? null,
        },
        select: {
          id: true,
          classId: true,
          studentId: true,
          reportingPeriodId: true,
          overridePercent: true,
          overrideLetterGrade: true,
          overrideReason: true,
          overriddenByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return record ?? null;
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return null;
      }

      throw error;
    }
  }

  async upsert(
    user: AuthUser,
    classId: string,
    studentId: string,
    data: {
      reportingPeriodId: string | null;
      overridePercent: number | null | undefined;
      overrideReason?: string | null;
    },
  ) {
    await this.ensureUserCanManageClass(user, classId);
    await this.ensureStudentEnrolledInClass(studentId, classId);

    const reason = data.overrideReason?.trim() || null;

    const overridePercent = data.overridePercent === undefined ? undefined : data.overridePercent;
    if (overridePercent === undefined || overridePercent === null) {
      throw new BadRequestException('overridePercent is required');
    }

    try {
      const existing = await this.prisma.gradeOverride.findFirst({
        where: {
          classId,
          studentId,
          reportingPeriodId: data.reportingPeriodId ?? null,
        },
        select: { id: true },
      });

      if (existing) {
        return await this.prisma.gradeOverride.update({
          where: { id: existing.id },
          data: {
            reportingPeriodId: data.reportingPeriodId ?? null,
            overridePercent,
            overrideLetterGrade: null,
            overrideReason: reason,
            overriddenByUserId: user.id,
          },
        });
      }

      return await this.prisma.gradeOverride.create({
        data: {
          classId,
          studentId,
          reportingPeriodId: data.reportingPeriodId ?? null,
          overridePercent: overridePercent ?? null,
          overrideLetterGrade: null,
          overrideReason: reason,
          overriddenByUserId: user.id,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Grade-override migrations are required before saving overrides. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  async remove(
    user: AuthUser,
    classId: string,
    studentId: string,
    reportingPeriodId: string | null,
  ) {
    await this.ensureUserCanManageClass(user, classId);
    await this.ensureStudentEnrolledInClass(studentId, classId);

    try {
      const existing = await this.prisma.gradeOverride.findFirst({
        where: {
          classId,
          studentId,
          reportingPeriodId: reportingPeriodId ?? null,
        },
        select: { id: true },
      });

      if (!existing) {
        return { success: true };
      }

      await this.prisma.gradeOverride.delete({ where: { id: existing.id } });
      return { success: true };
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return { success: true };
      }

      throw error;
    }
  }
}
