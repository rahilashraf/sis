import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { AssignTeacherDto } from './dto/assign-teacher.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';

type AuthUser = {
  id: string;
  role: string;
};

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  private isAdminLike(role: string) {
    return ['OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role);
  }

  private isTeacherLike(role: string) {
    return ['TEACHER', 'SUPPLY_TEACHER'].includes(role);
  }

  private async ensureTeacherAssignedToClass(
    teacherId: string,
    classId: string,
  ) {
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

  private async ensureUserCanReadClassRoster(user: AuthUser, classId: string) {
    if (this.isAdminLike(user.role)) {
      return;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have class access');
    }

    await this.ensureTeacherAssignedToClass(user.id, classId);
  }

  private async ensureParentLinkedToStudent(
    parentId: string,
    studentId: string,
  ) {
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

  private async ensureTeacherCanAccessStudent(
    user: AuthUser,
    studentId: string,
  ) {
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

  create(data: CreateClassDto) {
    return this.prisma.class.create({
      data: {
        schoolId: data.schoolId,
        schoolYearId: data.schoolYearId,
        name: data.name,
        subject: data.subject,
        isHomeroom: data.isHomeroom ?? false,
      },
      include: {
        school: true,
        schoolYear: true,
        teachers: {
          include: {
            teacher: true,
          },
        },
        students: {
          include: {
            student: true,
          },
        },
      },
    });
  }

  findAll() {
    return this.prisma.class.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        school: true,
        schoolYear: true,
        teachers: {
          include: {
            teacher: true,
          },
        },
        students: {
          include: {
            student: true,
          },
        },
      },
    });
  }

  async findMyClasses(user: AuthUser) {
    if (this.isAdminLike(user.role)) {
      return this.prisma.class.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: {
          school: true,
          schoolYear: true,
          teachers: {
            include: {
              teacher: true,
            },
          },
        },
      });
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have class access');
    }

    const assignments = await this.prisma.teacherClassAssignment.findMany({
      where: { teacherId: user.id },
      include: {
        class: {
          include: {
            school: true,
            schoolYear: true,
            teachers: {
              include: {
                teacher: true,
              },
            },
          },
        },
      },
      orderBy: {
        class: {
          name: 'asc',
        },
      },
    });

    return assignments.map((assignment) => assignment.class);
  }

  assignTeacher(classId: string, data: AssignTeacherDto) {
    return this.prisma.teacherClassAssignment.create({
      data: {
        classId,
        teacherId: data.teacherId,
      },
      include: {
        teacher: true,
        class: true,
      },
    });
  }

  async removeTeacher(classId: string, teacherId: string) {
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: {
        classId,
        teacherId,
      },
      select: {
        id: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Teacher assignment not found');
    }

    return this.prisma.teacherClassAssignment.delete({
      where: {
        id: assignment.id,
      },
      include: {
        teacher: true,
        class: true,
      },
    });
  }

  enrollStudent(classId: string, data: EnrollStudentDto) {
    return this.prisma.studentClassEnrollment.create({
      data: {
        classId,
        studentId: data.studentId,
      },
      include: {
        student: true,
        class: true,
      },
    });
  }

  async unenrollStudent(classId: string, studentId: string) {
    const enrollment = await this.prisma.studentClassEnrollment.findFirst({
      where: {
        classId,
        studentId,
      },
      select: {
        id: true,
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Student enrollment not found');
    }

    return this.prisma.studentClassEnrollment.delete({
      where: {
        id: enrollment.id,
      },
      include: {
        student: true,
        class: true,
      },
    });
  }

  async setClassActiveState(classId: string, isActive: boolean) {
    const existingClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });

    if (!existingClass) {
      throw new NotFoundException('Class not found');
    }

    return this.prisma.class.update({
      where: { id: classId },
      data: { isActive },
      include: {
        school: true,
        schoolYear: true,
        teachers: {
          include: {
            teacher: true,
          },
        },
        students: {
          include: {
            student: true,
          },
        },
      },
    });
  }

  async findTeachers(user: AuthUser, classId: string) {
    await this.ensureUserCanReadClassRoster(user, classId);

    return this.prisma.teacherClassAssignment.findMany({
      where: { classId },
      include: {
        teacher: true,
      },
    });
  }

  async findStudents(user: AuthUser, classId: string) {
    await this.ensureUserCanReadClassRoster(user, classId);

    return this.prisma.studentClassEnrollment.findMany({
      where: { classId },
      include: {
        student: true,
      },
    });
  }

  async findClassesForTeacher(user: AuthUser, teacherId: string) {
    if (!this.isAdminLike(user.role)) {
      if (!this.isTeacherLike(user.role) || user.id !== teacherId) {
        throw new ForbiddenException('You do not have teacher access');
      }
    }

    return this.prisma.teacherClassAssignment.findMany({
      where: { teacherId },
      include: {
        class: {
          include: {
            school: true,
            schoolYear: true,
          },
        },
      },
    });
  }

  async findClassesForStudent(user: AuthUser, studentId: string) {
    if (!this.isAdminLike(user.role)) {
      if (user.role === 'STUDENT') {
        if (user.id !== studentId) {
          throw new ForbiddenException('You do not have student access');
        }
      } else if (user.role === 'PARENT') {
        await this.ensureParentLinkedToStudent(user.id, studentId);
      } else if (this.isTeacherLike(user.role)) {
        await this.ensureTeacherCanAccessStudent(user, studentId);
      } else {
        throw new ForbiddenException('You do not have student access');
      }
    }

    return this.prisma.studentClassEnrollment.findMany({
      where: { studentId },
      include: {
        class: {
          include: {
            school: true,
            schoolYear: true,
          },
        },
      },
    });
  }
}
