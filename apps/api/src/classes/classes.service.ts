import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogSeverity,
  Prisma,
  TeacherClassAssignmentType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { AssignTeacherDto } from './dto/assign-teacher.dto';
import { UpdateTeacherAssignmentDto } from './dto/update-teacher-assignment.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { BulkEnrollStudentClassesDto } from './dto/bulk-enroll-student-classes.dto';
import { BulkEnrollClassStudentsDto } from './dto/bulk-enroll-class-students.dto';
import { DuplicateClassDto } from './dto/duplicate-class.dto';
import { CopyGradebookSettingsDto } from './dto/copy-gradebook-settings.dto';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isHighPrivilegeRole,
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
import { AuditService } from '../audit/audit.service';
import { buildAuditDiff } from '../audit/audit-diff.util';

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private readonly duplicateClassNameMessage =
    'A class with this name, grade level, and subject already exists for this school year';

  private toUniqueIds(values: string[]) {
    return Array.from(
      new Set(values.map((value) => value.trim()).filter(Boolean)),
    );
  }

  private parseMinutes(value: string) {
    const [hoursRaw, minutesRaw] = value.split(':');
    const hours = Number.parseInt(hoursRaw ?? '', 10);
    const minutes = Number.parseInt(minutesRaw ?? '', 10);

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      throw new BadRequestException('Invalid timetable block time value');
    }

    return hours * 60 + minutes;
  }

  private hasTimeOverlap(
    startA: string,
    endA: string,
    startB: string,
    endB: string,
  ) {
    const aStart = this.parseMinutes(startA);
    const aEnd = this.parseMinutes(endA);
    const bStart = this.parseMinutes(startB);
    const bEnd = this.parseMinutes(endB);
    return aStart < bEnd && aEnd > bStart;
  }

  private async detectTimetableEnrollmentConflicts(
    studentId: string,
    targetClass: { id: string; schoolYearId: string },
  ) {
    const existingEnrollments = await this.prisma.studentClassEnrollment.findMany({
      where: {
        studentId,
        classId: {
          not: targetClass.id,
        },
        class: {
          schoolYearId: targetClass.schoolYearId,
          isActive: true,
        },
      },
      select: {
        classId: true,
        class: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (existingEnrollments.length === 0) {
      return [] as string[];
    }

    const existingClassNameById = new Map(
      existingEnrollments.map((entry) => [entry.classId, entry.class.name]),
    );

    const targetBlocks = await this.prisma.timetableBlockClass.findMany({
      where: {
        classId: targetClass.id,
        timetableBlock: {
          isActive: true,
          schoolYearId: targetClass.schoolYearId,
        },
      },
      select: {
        timetableBlock: {
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    if (targetBlocks.length === 0) {
      return [] as string[];
    }

    const existingBlocks = await this.prisma.timetableBlockClass.findMany({
      where: {
        classId: {
          in: Array.from(existingClassNameById.keys()),
        },
        timetableBlock: {
          isActive: true,
          schoolYearId: targetClass.schoolYearId,
        },
      },
      select: {
        classId: true,
        timetableBlock: {
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    const warnings = new Set<string>();
    for (const targetBlock of targetBlocks) {
      for (const existingBlock of existingBlocks) {
        if (targetBlock.timetableBlock.dayOfWeek !== existingBlock.timetableBlock.dayOfWeek) {
          continue;
        }

        if (
          !this.hasTimeOverlap(
            targetBlock.timetableBlock.startTime,
            targetBlock.timetableBlock.endTime,
            existingBlock.timetableBlock.startTime,
            existingBlock.timetableBlock.endTime,
          )
        ) {
          continue;
        }

        const conflictingClassName =
          existingClassNameById.get(existingBlock.classId) ?? existingBlock.classId;

        warnings.add(
          `Possible timetable overlap with ${conflictingClassName} on ${targetBlock.timetableBlock.dayOfWeek} (${targetBlock.timetableBlock.startTime}-${targetBlock.timetableBlock.endTime})`,
        );
      }
    }

    return Array.from(warnings);
  }

  async bulkEnrollStudentAcrossClasses(
    user: AuthenticatedUser,
    data: BulkEnrollStudentClassesDto,
  ) {
    return this.bulkEnrollStudentsAndClasses(user, {
      studentIds: [data.studentId],
      classIds: data.classIds,
    });
  }

  async bulkEnrollStudentsIntoClass(
    user: AuthenticatedUser,
    classId: string,
    data: BulkEnrollClassStudentsDto,
  ) {
    return this.bulkEnrollStudentsAndClasses(user, {
      studentIds: data.studentIds,
      classIds: [classId],
    });
  }

  private async bulkEnrollStudentsAndClasses(
    user: AuthenticatedUser,
    input: { studentIds: string[]; classIds: string[] },
  ) {
    const studentIds = this.toUniqueIds(input.studentIds);
    const classIds = this.toUniqueIds(input.classIds);

    if (studentIds.length === 0 || classIds.length === 0) {
      throw new BadRequestException('studentIds and classIds must both include values');
    }

    const classes = await this.prisma.class.findMany({
      where: {
        id: {
          in: classIds,
        },
      },
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
        name: true,
        isActive: true,
      },
    });

    const classById = new Map(classes.map((schoolClass) => [schoolClass.id, schoolClass]));

    const students = await this.prisma.user.findMany({
      where: {
        id: {
          in: studentIds,
        },
      },
      select: {
        id: true,
        role: true,
        isActive: true,
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

    const studentById = new Map(students.map((student) => [student.id, student]));

    const existingEnrollments = await this.prisma.studentClassEnrollment.findMany({
      where: {
        studentId: {
          in: studentIds,
        },
        classId: {
          in: classIds,
        },
      },
      select: {
        studentId: true,
        classId: true,
      },
    });

    const existingPairKeys = new Set(
      existingEnrollments.map((entry) => `${entry.studentId}:${entry.classId}`),
    );

    const success: Array<Awaited<ReturnType<ClassesService['enrollStudent']>>> = [];
    const skipped: Array<{ studentId: string; classId: string; reason: string }> = [];
    const failed: Array<{ studentId: string; classId: string; reason: string }> = [];
    const warnings: Array<{ studentId: string; classId: string; message: string }> = [];

    for (const classId of classIds) {
      const schoolClass = classById.get(classId);
      if (!schoolClass) {
        for (const studentId of studentIds) {
          failed.push({ studentId, classId, reason: 'Class not found' });
        }
        continue;
      }

      try {
        ensureUserHasSchoolAccess(user, schoolClass.schoolId);
      } catch {
        for (const studentId of studentIds) {
          failed.push({
            studentId,
            classId,
            reason: 'You do not have school access for this class',
          });
        }
        continue;
      }

      if (!schoolClass.isActive) {
        for (const studentId of studentIds) {
          failed.push({ studentId, classId, reason: 'Class is inactive' });
        }
        continue;
      }

      for (const studentId of studentIds) {
        const student = studentById.get(studentId);
        if (!student) {
          failed.push({ studentId, classId, reason: 'Student not found' });
          continue;
        }

        if (student.role !== UserRole.STUDENT) {
          failed.push({ studentId, classId, reason: 'User is not a student' });
          continue;
        }

        if (!student.isActive) {
          failed.push({ studentId, classId, reason: 'Student account is inactive' });
          continue;
        }

        const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
          memberships: student.memberships,
          legacySchoolId: student.schoolId,
        });

        if (!studentSchoolIds.includes(schoolClass.schoolId)) {
          failed.push({
            studentId,
            classId,
            reason: 'Student must belong to the same school as the class',
          });
          continue;
        }

        const pairKey = `${studentId}:${classId}`;
        if (existingPairKeys.has(pairKey)) {
          skipped.push({ studentId, classId, reason: 'Already enrolled' });
          continue;
        }

        try {
          const enrollment = await this.prisma.studentClassEnrollment.create({
            data: {
              classId,
              studentId,
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

          existingPairKeys.add(pairKey);
          success.push(enrollment as never);

          const conflictWarnings = await this.detectTimetableEnrollmentConflicts(studentId, {
            id: schoolClass.id,
            schoolYearId: schoolClass.schoolYearId,
          });

          for (const message of conflictWarnings) {
            warnings.push({ studentId, classId, message });
          }

          await this.auditService.log({
            actor: user,
            schoolId: enrollment.class.schoolId,
            entityType: 'StudentClassEnrollment',
            entityId: enrollment.id,
            action: 'ENROLL',
            severity: AuditLogSeverity.WARNING,
            summary: `Enrolled student ${enrollment.student.firstName} ${enrollment.student.lastName} in class ${enrollment.class.name}`,
            targetDisplay: enrollment.class.name,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            skipped.push({ studentId, classId, reason: 'Already enrolled' });
            existingPairKeys.add(pairKey);
            continue;
          }

          failed.push({
            studentId,
            classId,
            reason:
              error instanceof Error
                ? error.message
                : 'Unable to create enrollment',
          });
        }
      }
    }

    return {
      success,
      skipped,
      failed,
      warnings,
    };
  }

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
      takesAttendance: true,
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

  private ensureCrossSchoolCopyAllowed(
    user: AuthenticatedUser,
    sourceSchoolId: string,
    targetSchoolId: string,
  ) {
    if (sourceSchoolId === targetSchoolId) {
      return;
    }

    if (!isHighPrivilegeRole(user.role)) {
      throw new ForbiddenException(
        'Cross-school copy is restricted to owner and super admin roles',
      );
    }
  }

  private async getClassCopyContextOrThrow(classId: string) {
    const schoolClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
        gradeLevelId: true,
        subjectOptionId: true,
        name: true,
        subject: true,
        isHomeroom: true,
        takesAttendance: true,
        gradebookWeightingMode: true,
      },
    });

    if (!schoolClass) {
      throw new NotFoundException('Class not found');
    }

    return schoolClass;
  }

  private async copyAssessmentCategoriesToClass(
    sourceClassId: string,
    targetClassId: string,
  ) {
    const [sourceCategories, targetCategories] = await Promise.all([
      this.prisma.assessmentCategory.findMany({
        where: {
          classId: sourceClassId,
        },
        select: {
          id: true,
          name: true,
          sortOrder: true,
          weight: true,
          isActive: true,
        },
      }),
      this.prisma.assessmentCategory.findMany({
        where: {
          classId: targetClassId,
        },
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

    if (sourceCategories.length === 0) {
      return {
        copied: false,
        createdCount: 0,
        updatedCount: 0,
        sourceCount: 0,
      };
    }

    const targetByName = new Map(
      targetCategories.map((category) => [category.name.toLowerCase(), category]),
    );

    let createdCount = 0;
    let updatedCount = 0;

    for (const category of sourceCategories) {
      const existingTarget = targetByName.get(category.name.toLowerCase());

      if (existingTarget) {
        await this.prisma.assessmentCategory.update({
          where: {
            id: existingTarget.id,
          },
          data: {
            sortOrder: category.sortOrder,
            weight: category.weight,
            isActive: category.isActive,
          },
        });
        updatedCount += 1;
        continue;
      }

      await this.prisma.assessmentCategory.create({
        data: {
          classId: targetClassId,
          name: category.name,
          sortOrder: category.sortOrder,
          weight: category.weight,
          isActive: category.isActive,
        },
      });
      createdCount += 1;
    }

    return {
      copied: true,
      createdCount,
      updatedCount,
      sourceCount: sourceCategories.length,
    };
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
      const created = await this.prisma.class.create({
        data: {
          schoolId: data.schoolId,
          schoolYearId: data.schoolYearId,
          gradeLevelId: gradeLevel.id,
          subjectOptionId: subjectOption.id,
          name: className,
          subject: subjectOption.name,
          isHomeroom: data.isHomeroom ?? false,
          takesAttendance: data.takesAttendance ?? true,
        },
        select: this.buildClassSelect(),
      });

      await this.auditService.log({
        actor: user,
        schoolId: created.schoolId,
        entityType: 'Class',
        entityId: created.id,
        action: 'CREATE',
        severity: AuditLogSeverity.INFO,
        summary: `Created class ${created.name}`,
        targetDisplay: created.name,
        changesJson:
          buildAuditDiff({
            after: {
              schoolYearId: created.schoolYearId,
              gradeLevelId: created.gradeLevelId,
              subjectOptionId: created.subjectOptionId,
              isHomeroom: created.isHomeroom,
              takesAttendance: created.takesAttendance,
              isActive: created.isActive,
            },
          }) ?? undefined,
      });

      return created;
    } catch (error) {
      this.rethrowDuplicateClassNameError(error);
    }
  }

  findAll(
    user: AuthenticatedUser,
    includeInactive = false,
    requestedSchoolId?: string,
  ) {
    const schoolId = requestedSchoolId?.trim() || null;
    const accessibleSchoolIds = getAccessibleSchoolIds(user);

    if (schoolId && !isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);
    }

    return this.prisma.class.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(schoolId
          ? { schoolId }
          : isBypassRole(user.role)
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

    const assignment = await this.prisma.teacherClassAssignment.upsert({
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

    await this.auditService.log({
      actor: user,
      schoolId: assignment.class.schoolId,
      entityType: 'TeacherClassAssignment',
      entityId: assignment.id,
      action: 'ASSIGN_TEACHER',
      severity: AuditLogSeverity.WARNING,
      summary: `Assigned teacher ${assignment.teacher.firstName} ${assignment.teacher.lastName} to class ${assignment.class.name}`,
      targetDisplay: assignment.class.name,
      changesJson: {
        assignmentType: assignment.assignmentType,
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
      },
    });

    return assignment;
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

    const removed = await this.prisma.teacherClassAssignment.delete({
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

    await this.auditService.log({
      actor: user,
      schoolId: removed.class.schoolId,
      entityType: 'TeacherClassAssignment',
      entityId: removed.id,
      action: 'REMOVE_TEACHER',
      severity: AuditLogSeverity.WARNING,
      summary: `Removed teacher ${removed.teacher.firstName} ${removed.teacher.lastName} from class ${removed.class.name}`,
      targetDisplay: removed.class.name,
    });

    return removed;
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

    const updated = await this.prisma.teacherClassAssignment.update({
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

    await this.auditService.log({
      actor: user,
      schoolId: updated.class.schoolId,
      entityType: 'TeacherClassAssignment',
      entityId: updated.id,
      action: 'UPDATE',
      severity: AuditLogSeverity.WARNING,
      summary: `Updated teacher assignment for class ${updated.class.name}`,
      targetDisplay: updated.class.name,
      changesJson:
        buildAuditDiff({
          before: {
            assignmentType: assignment.assignmentType,
            startsAt: assignment.startsAt,
            endsAt: assignment.endsAt,
          },
          after: {
            assignmentType: updated.assignmentType,
            startsAt: updated.startsAt,
            endsAt: updated.endsAt,
          },
        }) ?? undefined,
    });

    return updated;
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

    const enrollment = await this.prisma.studentClassEnrollment.create({
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

    await this.auditService.log({
      actor: user,
      schoolId: enrollment.class.schoolId,
      entityType: 'StudentClassEnrollment',
      entityId: enrollment.id,
      action: 'ENROLL',
      severity: AuditLogSeverity.WARNING,
      summary: `Enrolled student ${enrollment.student.firstName} ${enrollment.student.lastName} in class ${enrollment.class.name}`,
      targetDisplay: enrollment.class.name,
    });

    return enrollment;
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

    const removed = await this.prisma.studentClassEnrollment.delete({
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

    await this.auditService.log({
      actor: user,
      schoolId: removed.class.schoolId,
      entityType: 'StudentClassEnrollment',
      entityId: removed.id,
      action: 'UNENROLL',
      severity: AuditLogSeverity.WARNING,
      summary: `Unenrolled student ${removed.student.firstName} ${removed.student.lastName} from class ${removed.class.name}`,
      targetDisplay: removed.class.name,
    });

    return removed;
  }

  async setClassActiveState(
    user: AuthenticatedUser,
    classId: string,
    isActive: boolean,
  ) {
    const existingClass = await this.getClassOrThrow(classId);
    ensureUserHasSchoolAccess(user, existingClass.schoolId);

    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { isActive },
      select: this.buildClassSelect(),
    });

    await this.auditService.log({
      actor: user,
      schoolId: updated.schoolId,
      entityType: 'Class',
      entityId: updated.id,
      action: isActive ? 'ACTIVATE' : 'ARCHIVE',
      severity: isActive ? AuditLogSeverity.INFO : AuditLogSeverity.WARNING,
      summary: `${isActive ? 'Activated' : 'Archived'} class ${updated.name}`,
      targetDisplay: updated.name,
    });

    return updated;
  }

  async update(user: AuthenticatedUser, classId: string, data: UpdateClassDto) {
    const existingClass = await this.getClassOrThrow(classId);
    ensureUserHasSchoolAccess(user, existingClass.schoolId);
    const before = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      select: {
        id: true,
        name: true,
        isActive: true,
        isHomeroom: true,
        takesAttendance: true,
        gradeLevelId: true,
        subjectOptionId: true,
      },
    });

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    const updateData: Prisma.ClassUpdateInput = {
      isHomeroom: data.isHomeroom,
      isActive: data.isActive,
      takesAttendance: data.takesAttendance,
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
      updateData.takesAttendance === undefined &&
      updateData.isActive === undefined &&
      updateData.gradeLevel === undefined &&
      updateData.subjectOption === undefined &&
      updateData.subject === undefined
    ) {
      throw new BadRequestException('No valid fields provided for update');
    }

    try {
      const updated = await this.prisma.class.update({
        where: { id: classId },
        data: updateData,
        select: this.buildClassSelect(),
      });

      await this.auditService.log({
        actor: user,
        schoolId: updated.schoolId,
        entityType: 'Class',
        entityId: updated.id,
        action: 'UPDATE',
        severity: AuditLogSeverity.INFO,
        summary: `Updated class ${updated.name}`,
        targetDisplay: updated.name,
        changesJson:
          buildAuditDiff({
            before,
            after: {
              name: updated.name,
              isActive: updated.isActive,
              isHomeroom: updated.isHomeroom,
              takesAttendance: updated.takesAttendance,
              gradeLevelId: updated.gradeLevelId,
              subjectOptionId: updated.subjectOptionId,
            },
          }) ?? undefined,
      });

      return updated;
    } catch (error) {
      this.rethrowDuplicateClassNameError(error);
    }
  }

  async duplicateClass(
    user: AuthenticatedUser,
    sourceClassId: string,
    data: DuplicateClassDto,
  ) {
    if (data.copyAssessments) {
      throw new BadRequestException(
        'copyAssessments is not supported in this safe v1 flow',
      );
    }

    const sourceClass = await this.getClassCopyContextOrThrow(sourceClassId);
    ensureUserHasSchoolAccess(user, sourceClass.schoolId);
    ensureUserHasSchoolAccess(user, data.targetSchoolId);
    this.ensureCrossSchoolCopyAllowed(
      user,
      sourceClass.schoolId,
      data.targetSchoolId,
    );

    if (!sourceClass.gradeLevelId && !data.targetGradeLevelId) {
      throw new BadRequestException(
        'targetGradeLevelId is required when the source class has no grade level',
      );
    }

    if (!sourceClass.subjectOptionId && !data.targetSubjectOptionId) {
      throw new BadRequestException(
        'targetSubjectOptionId is required when the source class has no subject option',
      );
    }

    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: data.targetSchoolYearId },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!schoolYear) {
      throw new NotFoundException('School year not found');
    }

    if (schoolYear.schoolId !== data.targetSchoolId) {
      throw new BadRequestException(
        'targetSchoolYearId does not belong to targetSchoolId',
      );
    }

    const resolvedGradeLevelId =
      data.targetGradeLevelId ??
      (data.targetSchoolId === sourceClass.schoolId ? sourceClass.gradeLevelId : null);
    const resolvedSubjectOptionId =
      data.targetSubjectOptionId ?? sourceClass.subjectOptionId;

    if (!resolvedGradeLevelId || !resolvedSubjectOptionId) {
      throw new BadRequestException(
        'A grade level and subject option are required for duplication',
      );
    }

    await this.getGradeLevelOrThrow(
      resolvedGradeLevelId,
      data.targetSchoolId,
      true,
    );
    await this.getSubjectOptionOrThrow(resolvedSubjectOptionId, true);

    const sourceTeacherAssignments = data.targetTeacherId
      ? []
      : await this.prisma.teacherClassAssignment.findMany({
          where: {
            classId: sourceClass.id,
          },
          select: {
            teacherId: true,
            assignmentType: true,
            startsAt: true,
            endsAt: true,
            teacher: {
              select: {
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
            },
          },
        });

    const createdClass = await this.create(user, {
      schoolId: data.targetSchoolId,
      schoolYearId: data.targetSchoolYearId,
      gradeLevelId: resolvedGradeLevelId,
      subjectOptionId: resolvedSubjectOptionId,
      name: data.targetName?.trim() || sourceClass.name,
      isHomeroom: data.isHomeroom ?? sourceClass.isHomeroom,
      takesAttendance: data.takesAttendance ?? sourceClass.takesAttendance,
    });

    await this.prisma.class.update({
      where: {
        id: createdClass.id,
      },
      data: {
        gradebookWeightingMode: sourceClass.gradebookWeightingMode,
      },
      select: {
        id: true,
      },
    });

    const categoryCopySummary =
      data.copyAssessmentCategories === true
        ? await this.copyAssessmentCategoriesToClass(sourceClass.id, createdClass.id)
        : {
            copied: false,
            createdCount: 0,
            updatedCount: 0,
            sourceCount: 0,
          };

    let copiedTeacherAssignments = 0;
    let skippedTeacherAssignments = 0;

    if (data.targetTeacherId) {
      await this.assignTeacher(user, createdClass.id, {
        teacherId: data.targetTeacherId,
      });
      copiedTeacherAssignments += 1;
    } else {
      for (const assignment of sourceTeacherAssignments) {
        if (!this.isTeacherLike(assignment.teacher.role)) {
          skippedTeacherAssignments += 1;
          continue;
        }

        const teacherSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
          memberships: assignment.teacher.memberships,
          legacySchoolId: assignment.teacher.schoolId,
        });

        if (!teacherSchoolIds.includes(data.targetSchoolId)) {
          skippedTeacherAssignments += 1;
          continue;
        }

        await this.assignTeacher(user, createdClass.id, {
          teacherId: assignment.teacherId,
          assignmentType: assignment.assignmentType,
          startsAt: assignment.startsAt?.toISOString() ?? null,
          endsAt: assignment.endsAt?.toISOString() ?? null,
        });
        copiedTeacherAssignments += 1;
      }
    }

    const refreshed = await this.prisma.class.findUniqueOrThrow({
      where: {
        id: createdClass.id,
      },
      select: this.buildClassSelect(),
    });

    return {
      class: refreshed,
      copiedFromClassId: sourceClass.id,
      copiedWeightingMode: true,
      copiedAssessmentCategories: categoryCopySummary,
      copiedAssessments: false,
      copiedEnrollments: false,
      copiedGrades: false,
      copiedTeacherAssignments,
      skippedTeacherAssignments,
    };
  }

  async copyGradebookSettings(
    user: AuthenticatedUser,
    sourceClassId: string,
    data: CopyGradebookSettingsDto,
  ) {
    const [sourceClass, targetClass] = await Promise.all([
      this.getClassCopyContextOrThrow(sourceClassId),
      this.getClassCopyContextOrThrow(data.targetClassId),
    ]);

    ensureUserHasSchoolAccess(user, sourceClass.schoolId);
    ensureUserHasSchoolAccess(user, targetClass.schoolId);
    this.ensureCrossSchoolCopyAllowed(
      user,
      sourceClass.schoolId,
      targetClass.schoolId,
    );

    await this.prisma.class.update({
      where: {
        id: targetClass.id,
      },
      data: {
        gradebookWeightingMode: sourceClass.gradebookWeightingMode,
      },
      select: {
        id: true,
      },
    });

    const categoryCopySummary =
      data.copyAssessmentCategories === true
        ? await this.copyAssessmentCategoriesToClass(sourceClass.id, targetClass.id)
        : {
            copied: false,
            createdCount: 0,
            updatedCount: 0,
            sourceCount: 0,
          };

    return {
      sourceClassId: sourceClass.id,
      targetClassId: targetClass.id,
      weightingMode: sourceClass.gradebookWeightingMode,
      copiedAssessmentCategories: categoryCopySummary,
      copiedAssessments: false,
      copiedGrades: false,
      copiedEnrollments: false,
    };
  }

  async remove(user: AuthenticatedUser, classId: string) {
    const existingClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        name: true,
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

      await this.auditService.log({
        actor: user,
        schoolId: existingClass.schoolId,
        entityType: 'Class',
        entityId: existingClass.id,
        action: 'DELETE',
        severity: AuditLogSeverity.HIGH,
        summary: `Deleted class ${existingClass.name}`,
        targetDisplay: existingClass.name,
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

    await this.auditService.log({
      actor: user,
      schoolId: existingClass.schoolId,
      entityType: 'Class',
      entityId: existingClass.id,
      action: 'ARCHIVE',
      severity: AuditLogSeverity.WARNING,
      summary: `Archived class ${existingClass.name} because dependencies exist`,
      targetDisplay: existingClass.name,
      changesJson: {
        dependencyLabels,
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
