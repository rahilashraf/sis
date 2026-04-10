import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradeRecordDto } from './dto/create-grade-record.dto';
import { UpdateGradeRecordDto } from './dto/update-grade-record.dto';

type AuthUser = {
  id: string;
  role: UserRole;
};

@Injectable()
export class GradesService {
  constructor(private readonly prisma: PrismaService) {}

  private isAdminLike(role: UserRole) {
    return ['OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role);
  }

  private isTeacherLike(role: UserRole) {
    return ['TEACHER', 'SUPPLY_TEACHER'].includes(role);
  }

  private canOverrideReportingPeriodLock(role: UserRole) {
    return ['OWNER', 'SUPER_ADMIN', 'ADMIN'].includes(role);
  }

  private buildInclude() {
    return {
      class: {
        include: {
          school: true,
          schoolYear: true,
        },
      },
      student: true,
    };
  }

  private validateScoreRange(score: number, maxScore: number) {
    if (score > maxScore) {
      throw new BadRequestException('score must be less than or equal to maxScore');
    }
  }

  private async ensureClassExists(classId: string) {
    const existingClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });

    if (!existingClass) {
      throw new NotFoundException('Class not found');
    }
  }

  private parseGradedAt(gradedAt: string) {
    const parsedDate = new Date(gradedAt);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('gradedAt must be a valid date');
    }

    return parsedDate;
  }

  private async findReportingPeriodForDate(classId: string, gradedAt: Date) {
    const existingClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
      },
    });

    if (!existingClass) {
      throw new NotFoundException('Class not found');
    }

    const reportingPeriod = await this.prisma.reportingPeriod.findFirst({
      where: {
        schoolId: existingClass.schoolId,
        schoolYearId: existingClass.schoolYearId,
        startsAt: {
          lte: gradedAt,
        },
        endsAt: {
          gte: gradedAt,
        },
      },
      select: {
        id: true,
        isLocked: true,
      },
    });

    if (!reportingPeriod) {
      throw new BadRequestException(
        'gradedAt must fall within a reporting period',
      );
    }

    return reportingPeriod;
  }

  private async ensureUserCanWriteGradeForDate(
    user: AuthUser,
    classId: string,
    gradedAt: Date,
  ) {
    const reportingPeriod = await this.findReportingPeriodForDate(
      classId,
      gradedAt,
    );

    if (
      reportingPeriod.isLocked &&
      !this.canOverrideReportingPeriodLock(user.role)
    ) {
      throw new ForbiddenException('Reporting period is locked');
    }
  }

  private async ensureTeacherAssignedToClass(teacherId: string, classId: string) {
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: {
        teacherId,
        classId,
      },
      select: {
        id: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have class access');
    }
  }

  private async ensureStudentEnrolledInClass(studentId: string, classId: string) {
    const enrollment = await this.prisma.studentClassEnrollment.findFirst({
      where: {
        studentId,
        classId,
      },
      select: {
        id: true,
      },
    });

    if (!enrollment) {
      throw new BadRequestException('Student is not enrolled in this class');
    }
  }

  private async ensureParentLinkedToStudent(parentId: string, studentId: string) {
    const link = await this.prisma.studentParentLink.findUnique({
      where: {
        parentId_studentId: {
          parentId,
          studentId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!link) {
      throw new ForbiddenException('You do not have student access');
    }
  }

  private async ensureTeacherCanAccessStudent(user: AuthUser, studentId: string) {
    const enrollment = await this.prisma.studentClassEnrollment.findFirst({
      where: {
        studentId,
        class: {
          teachers: {
            some: {
              teacherId: user.id,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!enrollment) {
      throw new ForbiddenException('You do not have student access');
    }
  }

  private async ensureUserCanManageClass(user: AuthUser, classId: string) {
    if (this.isAdminLike(user.role)) {
      return;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have class access');
    }

    await this.ensureTeacherAssignedToClass(user.id, classId);
  }

  private async ensureUserCanReadStudentGrades(user: AuthUser, studentId: string) {
    if (this.isAdminLike(user.role)) {
      return;
    }

    if (user.role === 'STUDENT') {
      if (user.id !== studentId) {
        throw new ForbiddenException('You do not have student access');
      }

      return;
    }

    if (user.role === 'PARENT') {
      await this.ensureParentLinkedToStudent(user.id, studentId);
      return;
    }

    if (this.isTeacherLike(user.role)) {
      await this.ensureTeacherCanAccessStudent(user, studentId);
      return;
    }

    throw new ForbiddenException('You do not have student access');
  }

  async create(user: AuthUser, data: CreateGradeRecordDto) {
    this.validateScoreRange(data.score, data.maxScore);

    const gradedAt = this.parseGradedAt(data.gradedAt);

    await this.ensureClassExists(data.classId);
    await this.ensureUserCanManageClass(user, data.classId);
    await this.ensureStudentEnrolledInClass(data.studentId, data.classId);
    await this.ensureUserCanWriteGradeForDate(user, data.classId, gradedAt);

    return this.prisma.gradeRecord.create({
      data: {
        classId: data.classId,
        studentId: data.studentId,
        title: data.title,
        score: data.score,
        maxScore: data.maxScore,
        gradedAt,
        comment: data.comment,
      },
      include: this.buildInclude(),
    });
  }

  async update(user: AuthUser, id: string, data: UpdateGradeRecordDto) {
    const existingGrade = await this.prisma.gradeRecord.findUnique({
      where: { id },
      select: {
        id: true,
        classId: true,
        score: true,
        maxScore: true,
        gradedAt: true,
      },
    });

    if (!existingGrade) {
      throw new NotFoundException('Grade record not found');
    }

    await this.ensureUserCanManageClass(user, existingGrade.classId);

    if (!this.canOverrideReportingPeriodLock(user.role)) {
      await this.ensureUserCanWriteGradeForDate(
        user,
        existingGrade.classId,
        existingGrade.gradedAt,
      );
    }

    const gradedAt = data.gradedAt
      ? this.parseGradedAt(data.gradedAt)
      : existingGrade.gradedAt;
    const score = data.score ?? existingGrade.score;
    const maxScore = data.maxScore ?? existingGrade.maxScore;

    this.validateScoreRange(score, maxScore);
    await this.ensureUserCanWriteGradeForDate(user, existingGrade.classId, gradedAt);

    return this.prisma.gradeRecord.update({
      where: { id: existingGrade.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.score !== undefined ? { score: data.score } : {}),
        ...(data.maxScore !== undefined ? { maxScore: data.maxScore } : {}),
        ...(data.gradedAt !== undefined ? { gradedAt } : {}),
        ...(data.comment !== undefined ? { comment: data.comment } : {}),
      },
      include: this.buildInclude(),
    });
  }

  async findByClass(user: AuthUser, classId: string) {
    await this.ensureClassExists(classId);
    await this.ensureUserCanManageClass(user, classId);

    return this.prisma.gradeRecord.findMany({
      where: {
        classId,
      },
      orderBy: [{ gradedAt: 'desc' }, { createdAt: 'desc' }],
      include: this.buildInclude(),
    });
  }

  async findByStudent(user: AuthUser, studentId: string) {
    await this.ensureUserCanReadStudentGrades(user, studentId);

    const where = this.isTeacherLike(user.role) && !this.isAdminLike(user.role)
      ? {
          studentId,
          class: {
            teachers: {
              some: {
                teacherId: user.id,
              },
            },
          },
        }
      : {
          studentId,
        };

    return this.prisma.gradeRecord.findMany({
      where,
      orderBy: [{ gradedAt: 'desc' }, { createdAt: 'desc' }],
      include: this.buildInclude(),
    });
  }
}
