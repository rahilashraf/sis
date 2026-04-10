import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradeRecordDto } from './dto/create-grade-record.dto';

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

    await this.ensureClassExists(data.classId);
    await this.ensureUserCanManageClass(user, data.classId);
    await this.ensureStudentEnrolledInClass(data.studentId, data.classId);

    return this.prisma.gradeRecord.create({
      data: {
        classId: data.classId,
        studentId: data.studentId,
        title: data.title,
        score: data.score,
        maxScore: data.maxScore,
        gradedAt: new Date(data.gradedAt),
        comment: data.comment,
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
