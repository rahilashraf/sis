import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TeacherClassAssignmentType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { AssignTeacherDto } from './dto/assign-teacher.dto';
import { UpdateTeacherAssignmentDto } from './dto/update-teacher-assignment.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
  isSchoolAdminRole,
  isTeacherRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import {
  safeUserSelect,
  schoolSummarySelect,
  schoolYearSummarySelect,
} from '../common/prisma/safe-user-response';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly duplicateClassNameMessage =
    'A class with this name, grade level, and subject already exists for this school year';

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
      assignmentType: true,
      startsAt: true,
      endsAt: true,
      createdAt: true,
      updatedAt: true,
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

  private isDuplicateClassNameError(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== 'P2002') {
      return false;
    }

    const target = Array.isArray(error.meta?.target) ? error.meta.target : [];

    return (
      target.includes('schoolId') &&
      target.includes('schoolYearId') &&
      target.includes('name') &&
      target.includes('gradeLevelId') &&
      target.includes('subjectOptionId')
    );
  }

  private rethrowDuplicateClassNameError(error: unknown): never {
    if (this.isDuplicateClassNameError(error)) {
      throw new ConflictException(this.duplicateClassNameMessage);
    }

    throw error;
  }

  private buildClassSelect(includeStudents = true) {
    return {
      id: true,
      schoolId: true,
      schoolYearId: true,
      gradeLevelId: true,
      subjectOptionId: true,
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
      gradeLevel: {
        select: {
          id: true,
          name: true,
        },
      },
      subjectOption: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
      teachers: {
        select: this.buildTeacherAssignmentSelect(),
      },
      _count: {
        select: {
          students: true,
        },
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
        gradeLevelId: true,
        subjectOptionId: true,
      },
    });

    if (!existingClass) {
      throw new NotFoundException('Class not found');
    }

    return existingClass;
  }

  private async getGradeLevelOrThrow(
    gradeLevelId: string,
    schoolId: string,
    includeInactive = false,
  ) {
    const gradeLevel = await this.prisma.gradeLevel.findUnique({
      where: { id: gradeLevelId },
      select: {
        id: true,
        schoolId: true,
        name: true,
        isActive: true,
      },
    });

    if (!gradeLevel || gradeLevel.schoolId !== schoolId) {
      throw new BadRequestException('gradeLevelId does not belong to schoolId');
    }

    if (!includeInactive && !gradeLevel.isActive) {
      throw new BadRequestException('gradeLevelId must reference an active grade level');
    }

    return gradeLevel;
  }

  private async getSubjectOptionOrThrow(
    subjectOptionId: string,
    includeInactive = false,
  ) {
    const subjectOption = await this.prisma.enrollmentSubjectOption.findUnique({
      where: { id: subjectOptionId },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    if (!subjectOption) {
      throw new BadRequestException('subjectOptionId is invalid');
    }

    if (!includeInactive && !subjectOption.isActive) {
      throw new BadRequestException('subjectOptionId must reference an active subject option');
    }

    return subjectOption;
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

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (expectedRole && user.role !== expectedRole) {
      throw new BadRequestException(`User must have role ${expectedRole}`);
    }

    return getAccessibleSchoolIdsWithLegacyFallback({
      memberships: user.memberships,
      legacySchoolId: user.schoolId,
    });
  }

  private buildActiveSupplyAssignmentWindowWhere(now: Date) {
    return {
      assignmentType: TeacherClassAssignmentType.SUPPLY,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    } satisfies Prisma.TeacherClassAssignmentWhereInput;
  }

  private buildTeacherClassAccessWhere(
    teacherId: string,
    classId: string,
    role: UserRole,
    now = new Date(),
  ) {
    if (role === UserRole.SUPPLY_TEACHER) {
      return {
        teacherId,
        classId,
        OR: [
          { assignmentType: TeacherClassAssignmentType.REGULAR },
          this.buildActiveSupplyAssignmentWindowWhere(now),
        ],
      } satisfies Prisma.TeacherClassAssignmentWhereInput;
    }

    return {
      teacherId,
      classId,
    } satisfies Prisma.TeacherClassAssignmentWhereInput;
  }

  private buildTeacherAssignmentAccessFilter(role: UserRole, now = new Date()) {
    if (role !== UserRole.SUPPLY_TEACHER) {
      return {} satisfies Prisma.TeacherClassAssignmentWhereInput;
    }

    return {
      OR: [
        { assignmentType: TeacherClassAssignmentType.REGULAR },
        this.buildActiveSupplyAssignmentWindowWhere(now),
      ],
    } satisfies Prisma.TeacherClassAssignmentWhereInput;
  }

  private async ensureTeacherAssignedToClass(
    user: AuthenticatedUser,
    classId: string,
  ) {
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: this.buildTeacherClassAccessWhere(user.id, classId, user.role),
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
    if (isBypassRole(user.role)) {
      return;
    }

    if (isSchoolAdminRole(user.role)) {
      const existingClass = await this.getClassOrThrow(classId);
      ensureUserHasSchoolAccess(user, existingClass.schoolId);
      return;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have class access');
    }

    await this.ensureTeacherAssignedToClass(user, classId);
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
    const now = new Date();
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: {
        teacherId: user.id,
        class: {
          students: {
            some: {
              studentId,
            },
          },
        },
        ...(user.role === UserRole.SUPPLY_TEACHER
          ? {
              OR: [
                { assignmentType: TeacherClassAssignmentType.REGULAR },
                this.buildActiveSupplyAssignmentWindowWhere(now),
              ],
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have student access');
    }
  }

  private parseDateTimeOrThrow(value: string, fieldName: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid datetime`);
    }

    return parsed;
  }

  private resolveTeacherAssignmentWindow(
    assignmentType: TeacherClassAssignmentType,
    startsAtInput: string | null | undefined,
    endsAtInput: string | null | undefined,
  ) {
    if (assignmentType === TeacherClassAssignmentType.REGULAR) {
      return {
        startsAt: null,
        endsAt: null,
      } as const;
    }

    if (!startsAtInput || !endsAtInput) {
      throw new BadRequestException(
        'startsAt and endsAt are required for supply teacher assignments',
      );
    }

    const startsAt = this.parseDateTimeOrThrow(startsAtInput, 'startsAt');
    const endsAt = this.parseDateTimeOrThrow(endsAtInput, 'endsAt');

    if (startsAt >= endsAt) {
      throw new BadRequestException('startsAt must be before endsAt');
    }

    return {
      startsAt,
      endsAt,
    } as const;
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

    const className = data.name.trim();
    if (!className) {
      throw new BadRequestException('name is required');
    }

    const [gradeLevel, subjectOption] = await Promise.all([
      this.getGradeLevelOrThrow(data.gradeLevelId, data.schoolId),
      this.getSubjectOptionOrThrow(data.subjectOptionId),
    ]);

    try {
      return await this.prisma.class.create({
        data: {
          schoolId: data.schoolId,
          schoolYearId: data.schoolYearId,
          gradeLevelId: gradeLevel.id,
          subjectOptionId: subjectOption.id,
          name: className,
          subject: subjectOption.name,
          isHomeroom: data.isHomeroom ?? false,
        },
        select: this.buildClassSelect(),
      });
    } catch (error) {
      this.rethrowDuplicateClassNameError(error);
    }
  }

  findAll(user: AuthenticatedUser, includeInactive = false) {
    const accessibleSchoolIds = getAccessibleSchoolIds(user);

    return this.prisma.class.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(isBypassRole(user.role)
          ? {}
          : {
              schoolId: {
                in: accessibleSchoolIds,
              },
            }),
      },
      orderBy: { createdAt: 'desc' },
      select: this.buildClassSelect(false),
    });
  }

  async findOne(user: AuthenticatedUser, classId: string) {
    const existingClass = await this.getClassOrThrow(classId);

    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, existingClass.schoolId);
    } else if (this.isTeacherLike(user.role)) {
      await this.ensureTeacherAssignedToClass(user, classId);
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
      where: {
        teacherId: user.id,
        class: {
          isActive: true,
        },
        ...this.buildTeacherAssignmentAccessFilter(user.role),
      },
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

    const assignmentType =
      data.assignmentType ??
      (teacher.role === UserRole.SUPPLY_TEACHER
        ? TeacherClassAssignmentType.SUPPLY
        : TeacherClassAssignmentType.REGULAR);

    if (
      teacher.role === UserRole.SUPPLY_TEACHER &&
      assignmentType !== TeacherClassAssignmentType.SUPPLY
    ) {
      throw new BadRequestException(
        'Supply teachers must use supply assignments',
      );
    }

    if (
      teacher.role !== UserRole.SUPPLY_TEACHER &&
      assignmentType === TeacherClassAssignmentType.SUPPLY
    ) {
      throw new BadRequestException(
        'Supply assignments can only be used with supply teachers',
      );
    }

    if (!teacherSchoolIds.includes(existingClass.schoolId)) {
      throw new BadRequestException(
        'Teacher must belong to the same school as the class',
      );
    }

    const assignmentWindow = this.resolveTeacherAssignmentWindow(
      assignmentType,
      data.startsAt,
      data.endsAt,
    );

    return this.prisma.teacherClassAssignment.upsert({
      where: {
        teacherId_classId: {
          teacherId: data.teacherId,
          classId,
        },
      },
      create: {
        classId,
        teacherId: data.teacherId,
        assignmentType,
        startsAt: assignmentWindow.startsAt,
        endsAt: assignmentWindow.endsAt,
      },
      update: {
        assignmentType,
        startsAt: assignmentWindow.startsAt,
        endsAt: assignmentWindow.endsAt,
      },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        assignmentType: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        updatedAt: true,
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
    if (!isBypassRole(user.role)) {
      const existingClass = await this.getClassOrThrow(classId);
      ensureUserHasSchoolAccess(user, existingClass.schoolId);
    }

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
        assignmentType: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        updatedAt: true,
        teacher: {
          select: safeUserSelect,
        },
        class: {
          select: this.buildClassSelect(false),
        },
      },
    });
  }

  async updateTeacherAssignment(
    user: AuthenticatedUser,
    classId: string,
    teacherId: string,
    data: UpdateTeacherAssignmentDto,
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
        assignmentType: true,
        startsAt: true,
        endsAt: true,
        teacher: {
          select: {
            id: true,
            role: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Teacher assignment not found');
    }

    const nextAssignmentType =
      data.assignmentType ?? assignment.assignmentType;

    if (
      assignment.teacher.role === UserRole.SUPPLY_TEACHER &&
      nextAssignmentType !== TeacherClassAssignmentType.SUPPLY
    ) {
      throw new BadRequestException(
        'Supply teachers must use supply assignments',
      );
    }

    if (
      assignment.teacher.role !== UserRole.SUPPLY_TEACHER &&
      nextAssignmentType === TeacherClassAssignmentType.SUPPLY
    ) {
      throw new BadRequestException(
        'Supply assignments can only be used with supply teachers',
      );
    }

    const startsAtInput =
      data.startsAt === undefined
        ? assignment.startsAt?.toISOString() ?? null
        : data.startsAt;
    const endsAtInput =
      data.endsAt === undefined
        ? assignment.endsAt?.toISOString() ?? null
        : data.endsAt;

    const assignmentWindow = this.resolveTeacherAssignmentWindow(
      nextAssignmentType,
      startsAtInput,
      endsAtInput,
    );

    return this.prisma.teacherClassAssignment.update({
      where: {
        id: assignment.id,
      },
      data: {
        assignmentType: nextAssignmentType,
        startsAt: assignmentWindow.startsAt,
        endsAt: assignmentWindow.endsAt,
      },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        assignmentType: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        updatedAt: true,
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
    if (!isBypassRole(user.role)) {
      const existingClass = await this.getClassOrThrow(classId);
      ensureUserHasSchoolAccess(user, existingClass.schoolId);
    }

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

    const updateData: Prisma.ClassUpdateInput = {
      isHomeroom: data.isHomeroom,
      isActive: data.isActive,
    };

    if (data.name !== undefined) {
      const className = data.name.trim();
      if (!className) {
        throw new BadRequestException('name is required');
      }
      updateData.name = className;
    }

    if (data.gradeLevelId !== undefined) {
      const gradeLevel = await this.getGradeLevelOrThrow(
        data.gradeLevelId,
        existingClass.schoolId,
      );
      updateData.gradeLevel = {
        connect: {
          id: gradeLevel.id,
        },
      };
    }

    if (data.subjectOptionId !== undefined) {
      const subjectOption = await this.getSubjectOptionOrThrow(data.subjectOptionId);
      updateData.subjectOption = {
        connect: {
          id: subjectOption.id,
        },
      };
      updateData.subject = subjectOption.name;
    }

    if (
      updateData.name === undefined &&
      updateData.isHomeroom === undefined &&
      updateData.isActive === undefined &&
      updateData.gradeLevel === undefined &&
      updateData.subjectOption === undefined &&
      updateData.subject === undefined
    ) {
      throw new BadRequestException('No valid fields provided for update');
    }

    try {
      return await this.prisma.class.update({
        where: { id: classId },
        data: updateData,
        select: this.buildClassSelect(),
      });
    } catch (error) {
      this.rethrowDuplicateClassNameError(error);
    }
  }

  async remove(user: AuthenticatedUser, classId: string) {
    const existingClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        schoolId: true,
        _count: {
          select: {
            teachers: true,
            students: true,
            gradeRecords: true,
            attendanceSessionClasses: true,
          },
        },
      },
    });

    if (!existingClass) {
      throw new NotFoundException('Class not found');
    }

    ensureUserHasSchoolAccess(user, existingClass.schoolId);

    const dependencyLabels: string[] = [
      ['teacher assignments', existingClass._count.teachers],
      ['student enrollments', existingClass._count.students],
      ['grade records', existingClass._count.gradeRecords],
      ['attendance sessions', existingClass._count.attendanceSessionClasses],
    ].flatMap(([label, count]: [string, number]) => (count > 0 ? [label] : []));

    if (dependencyLabels.length === 0) {
      await this.prisma.class.delete({
        where: {
          id: existingClass.id,
        },
      });

      return {
        success: true,
        removalMode: 'deleted' as const,
      };
    }

    await this.prisma.class.update({
      where: { id: existingClass.id },
      data: {
        isActive: false,
      },
    });

    return {
      success: true,
      removalMode: 'archived' as const,
      reason: `Class was archived because related ${dependencyLabels.join(', ')} still exist`,
    };
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

    const applyRoleFilter = !this.isAdminLike(user.role) && user.id === teacherId;

    return this.prisma.teacherClassAssignment.findMany({
      where: {
        teacherId,
        ...(applyRoleFilter
          ? this.buildTeacherAssignmentAccessFilter(user.role)
          : {}),
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
        assignmentType: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        updatedAt: true,
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
