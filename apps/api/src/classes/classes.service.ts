import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { AssignTeacherDto } from './dto/assign-teacher.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
  isSchoolAdminRole,
  isTeacherRole,
} from '../common/access/school-access.util';
import {
  safeUserSelect,
  schoolSummarySelect,
  schoolYearSummarySelect,
} from '../common/prisma/safe-user-response';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  private isAdminLike(role: UserRole) {
    return isBypassRole(role) || isSchoolAdminRole(role);
  }

  private isTeacherLike(role: UserRole) {
    return isTeacherRole(role);
  }

  private buildTeacherAssignmentSelect() {
    return {
      id: true,
      classId: true,
      teacherId: true,
      createdAt: true,
      teacher: {
        select: safeUserSelect,
      },
    } as const;
  }

  private buildStudentEnrollmentSelect() {
    return {
      id: true,
      classId: true,
      studentId: true,
      createdAt: true,
      student: {
        select: safeUserSelect,
      },
    } as const;
  }

  private buildClassSelect(includeStudents = true) {
    return {
      id: true,
      schoolId: true,
      schoolYearId: true,
      name: true,
      subject: true,
      isHomeroom: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      school: {
        select: schoolSummarySelect,
      },
      schoolYear: {
        select: schoolYearSummarySelect,
      },
      teachers: {
        select: this.buildTeacherAssignmentSelect(),
      },
      ...(includeStudents
        ? {
            students: {
              select: this.buildStudentEnrollmentSelect(),
            },
          }
        : {}),
    } as const;
  }

  private async getClassOrThrow(classId: string) {
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

    return existingClass;
  }

  private async getUserSchoolIdsOrThrow(
    userId: string,
    expectedRole?: UserRole,
  ) {
    const user = await this.prisma.user.findUnique({
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

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (expectedRole && user.role !== expectedRole) {
      throw new BadRequestException(`User must have role ${expectedRole}`);
    }

    return user.memberships.map((membership) => membership.schoolId);
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

  private async ensureAdminLikeCanAccessStudent(
    user: AuthenticatedUser,
    studentId: string,
  ) {
    if (isBypassRole(user.role)) {
      return;
    }

    const studentSchoolIds = await this.getUserSchoolIdsOrThrow(
      studentId,
      UserRole.STUDENT,
    );
    const accessibleSchoolIds = new Set(getAccessibleSchoolIds(user));
    const hasAccess = studentSchoolIds.some((schoolId) =>
      accessibleSchoolIds.has(schoolId),
    );

    if (!hasAccess) {
      throw new ForbiddenException('You do not have student access');
    }
  }

  private async ensureUserCanReadClassRoster(
    user: AuthenticatedUser,
    classId: string,
  ) {
    const existingClass = await this.getClassOrThrow(classId);

    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, existingClass.schoolId);
      return existingClass;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have class access');
    }

    await this.ensureTeacherAssignedToClass(user.id, classId);
    return existingClass;
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
    user: AuthenticatedUser,
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

  async create(user: AuthenticatedUser, data: CreateClassDto) {
    ensureUserHasSchoolAccess(user, data.schoolId);

    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: data.schoolYearId },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!schoolYear) {
      throw new NotFoundException('School year not found');
    }

    if (schoolYear.schoolId !== data.schoolId) {
      throw new BadRequestException('schoolYearId does not belong to schoolId');
    }

    return this.prisma.class.create({
      data: {
        schoolId: data.schoolId,
        schoolYearId: data.schoolYearId,
        name: data.name,
        subject: data.subject,
        isHomeroom: data.isHomeroom ?? false,
      },
      select: this.buildClassSelect(),
    });
  }

  findAll(user: AuthenticatedUser) {
    const accessibleSchoolIds = getAccessibleSchoolIds(user);

    return this.prisma.class.findMany({
      where: isBypassRole(user.role)
        ? undefined
        : {
            schoolId: {
              in: accessibleSchoolIds,
            },
          },
      orderBy: { createdAt: 'desc' },
      select: this.buildClassSelect(),
    });
  }

  async findOne(user: AuthenticatedUser, classId: string) {
    const existingClass = await this.getClassOrThrow(classId);

    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, existingClass.schoolId);
    } else if (this.isTeacherLike(user.role)) {
      await this.ensureTeacherAssignedToClass(user.id, classId);
    } else {
      throw new ForbiddenException('You do not have class access');
    }

    return this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      select: this.buildClassSelect(),
    });
  }

  async findMyClasses(user: AuthenticatedUser) {
    if (this.isAdminLike(user.role)) {
      return this.prisma.class.findMany({
        where: {
          isActive: true,
          ...(isBypassRole(user.role)
            ? {}
            : {
                schoolId: {
                  in: getAccessibleSchoolIds(user),
                },
              }),
        },
        orderBy: { name: 'asc' },
        select: this.buildClassSelect(false),
      });
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have class access');
    }

    const assignments = await this.prisma.teacherClassAssignment.findMany({
      where: { teacherId: user.id },
      select: {
        class: {
          select: this.buildClassSelect(false),
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

  async assignTeacher(
    user: AuthenticatedUser,
    classId: string,
    data: AssignTeacherDto,
  ) {
    const existingClass = await this.getClassOrThrow(classId);
    ensureUserHasSchoolAccess(user, existingClass.schoolId);

    const teacherSchoolIds = await this.getUserSchoolIdsOrThrow(data.teacherId);

    const teacher = await this.prisma.user.findUnique({
      where: { id: data.teacherId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    if (!this.isTeacherLike(teacher.role)) {
      throw new BadRequestException('teacherId must belong to a teacher user');
    }

    if (!teacherSchoolIds.includes(existingClass.schoolId)) {
      throw new BadRequestException(
        'Teacher must belong to the same school as the class',
      );
    }

    return this.prisma.teacherClassAssignment.create({
      data: {
        classId,
        teacherId: data.teacherId,
      },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        createdAt: true,
        teacher: {
          select: safeUserSelect,
        },
        class: {
          select: this.buildClassSelect(false),
        },
      },
    });
  }

  async removeTeacher(
    user: AuthenticatedUser,
    classId: string,
    teacherId: string,
  ) {
    const existingClass = await this.getClassOrThrow(classId);
    ensureUserHasSchoolAccess(user, existingClass.schoolId);

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
      select: {
        id: true,
        classId: true,
        teacherId: true,
        createdAt: true,
        teacher: {
          select: safeUserSelect,
        },
        class: {
          select: this.buildClassSelect(false),
        },
      },
    });
  }

  async enrollStudent(
    user: AuthenticatedUser,
    classId: string,
    data: EnrollStudentDto,
  ) {
    const existingClass = await this.getClassOrThrow(classId);
    ensureUserHasSchoolAccess(user, existingClass.schoolId);

    const studentSchoolIds = await this.getUserSchoolIdsOrThrow(
      data.studentId,
      UserRole.STUDENT,
    );

    if (!studentSchoolIds.includes(existingClass.schoolId)) {
      throw new BadRequestException(
        'Student must belong to the same school as the class',
      );
    }

    return this.prisma.studentClassEnrollment.create({
      data: {
        classId,
        studentId: data.studentId,
      },
      select: {
        id: true,
        classId: true,
        studentId: true,
        createdAt: true,
        student: {
          select: safeUserSelect,
        },
        class: {
          select: this.buildClassSelect(false),
        },
      },
    });
  }

  async unenrollStudent(
    user: AuthenticatedUser,
    classId: string,
    studentId: string,
  ) {
    const existingClass = await this.getClassOrThrow(classId);
    ensureUserHasSchoolAccess(user, existingClass.schoolId);

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
      select: {
        id: true,
        classId: true,
        studentId: true,
        createdAt: true,
        student: {
          select: safeUserSelect,
        },
        class: {
          select: this.buildClassSelect(false),
        },
      },
    });
  }

  async setClassActiveState(
    user: AuthenticatedUser,
    classId: string,
    isActive: boolean,
  ) {
    const existingClass = await this.getClassOrThrow(classId);
    ensureUserHasSchoolAccess(user, existingClass.schoolId);

    return this.prisma.class.update({
      where: { id: classId },
      data: { isActive },
      select: this.buildClassSelect(),
    });
  }

  async update(user: AuthenticatedUser, classId: string, data: UpdateClassDto) {
    const existingClass = await this.getClassOrThrow(classId);
    ensureUserHasSchoolAccess(user, existingClass.schoolId);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    return this.prisma.class.update({
      where: { id: classId },
      data: {
        name: data.name,
        subject: data.subject,
        isHomeroom: data.isHomeroom,
        isActive: data.isActive,
      },
      select: this.buildClassSelect(),
    });
  }

  async findTeachers(user: AuthenticatedUser, classId: string) {
    await this.ensureUserCanReadClassRoster(user, classId);

    return this.prisma.teacherClassAssignment.findMany({
      where: { classId },
      select: this.buildTeacherAssignmentSelect(),
    });
  }

  async findStudents(user: AuthenticatedUser, classId: string) {
    await this.ensureUserCanReadClassRoster(user, classId);

    return this.prisma.studentClassEnrollment.findMany({
      where: { classId },
      select: this.buildStudentEnrollmentSelect(),
    });
  }

  async findClassesForTeacher(user: AuthenticatedUser, teacherId: string) {
    if (!this.isAdminLike(user.role)) {
      if (!this.isTeacherLike(user.role) || user.id !== teacherId) {
        throw new ForbiddenException('You do not have teacher access');
      }
    }

    return this.prisma.teacherClassAssignment.findMany({
      where: {
        teacherId,
        ...(isBypassRole(user.role) || !this.isAdminLike(user.role)
          ? {}
          : {
              class: {
                schoolId: {
                  in: getAccessibleSchoolIds(user),
                },
              },
            }),
      },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        createdAt: true,
        class: {
          select: this.buildClassSelect(false),
        },
      },
    });
  }

  async findClassesForStudent(user: AuthenticatedUser, studentId: string) {
    if (this.isAdminLike(user.role)) {
      await this.ensureAdminLikeCanAccessStudent(user, studentId);
    } else if (user.role === 'STUDENT') {
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

    return this.prisma.studentClassEnrollment.findMany({
      where: {
        studentId,
        ...(isBypassRole(user.role) || !this.isAdminLike(user.role)
          ? {}
          : {
              class: {
                schoolId: {
                  in: getAccessibleSchoolIds(user),
                },
              },
            }),
      },
      select: {
        id: true,
        classId: true,
        studentId: true,
        createdAt: true,
        class: {
          select: this.buildClassSelect(false),
        },
      },
    });
  }
}
