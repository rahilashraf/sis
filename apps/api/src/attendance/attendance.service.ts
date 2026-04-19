import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceScopeType,
  AttendanceStatusCountBehavior,
  AttendanceStatus,
  Prisma,
  TeacherClassAssignmentType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';
import { UpdateAttendanceSessionDto } from './dto/update-attendance-session.dto';
import { CreateAttendanceCustomStatusDto } from './dto/create-attendance-custom-status.dto';
import { UpdateAttendanceCustomStatusDto } from './dto/update-attendance-custom-status.dto';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
  isSchoolAdminRole,
  isTeacherRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import { formatDateOnly, parseDateOnlyOrThrow } from '../common/dates/date-only.util';
import {
  safeUserSelect,
  schoolSummarySelect,
  schoolYearSummarySelect,
} from '../common/prisma/safe-user-response';

type AuthUser = AuthenticatedUser;

type SessionClassWithClass = {
  classId: string;
  class: unknown;
};

type RecordWithSessionClasses = {
  attendanceSession: {
    classes: SessionClassWithClass[];
  };
};

type SessionRecordWithStudent = {
  studentId: string;
  student: unknown;
};

type AttendanceSessionWithClassesAndRecords = {
  classes: SessionClassWithClass[];
  records: SessionRecordWithStudent[];
};

type AttendanceSessionWithClassLinks = {
  classes: { classId: string }[];
};

type AttendanceStatusRuleValue = {
  status: AttendanceStatus;
  behavior: AttendanceStatusCountBehavior;
};

type AttendanceCustomStatusMap = Map<
  string,
  {
    id: string;
    behavior: AttendanceStatusCountBehavior;
    label: string;
    isActive: boolean;
  }
>;

const defaultStatusBehaviorByStatus: Record<
  AttendanceStatus,
  AttendanceStatusCountBehavior
> = {
  PRESENT: AttendanceStatusCountBehavior.PRESENT,
  ABSENT: AttendanceStatusCountBehavior.ABSENT,
  LATE: AttendanceStatusCountBehavior.LATE,
  EXCUSED: AttendanceStatusCountBehavior.INFORMATIONAL,
};

function isSchemaMissingError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

const attendanceClassSummarySelect = Prisma.validator<Prisma.ClassSelect>()({
  id: true,
  schoolId: true,
  schoolYearId: true,
  name: true,
  subject: true,
  isHomeroom: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
});

const attendanceSessionRecordOrderBy: Prisma.AttendanceRecordOrderByWithRelationInput[] =
  [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }];

const attendanceSessionSelect =
  Prisma.validator<Prisma.AttendanceSessionSelect>()({
    id: true,
    schoolId: true,
    schoolYearId: true,
    takenById: true,
    date: true,
    scopeType: true,
    scopeLabel: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    school: {
      select: schoolSummarySelect,
    },
    schoolYear: {
      select: schoolYearSummarySelect,
    },
    takenBy: {
      select: safeUserSelect,
    },
    classes: {
      select: {
        id: true,
        attendanceSessionId: true,
        classId: true,
        createdAt: true,
        class: {
          select: attendanceClassSummarySelect,
        },
      },
    },
    records: {
      select: {
        id: true,
        attendanceSessionId: true,
        studentId: true,
        date: true,
        status: true,
        customStatusId: true,
        customStatus: {
          select: {
            id: true,
            label: true,
            behavior: true,
            isActive: true,
          },
        },
        remark: true,
        createdAt: true,
        updatedAt: true,
        student: {
          select: safeUserSelect,
        },
      },
      orderBy: attendanceSessionRecordOrderBy,
    },
  });

const attendanceRecordSelect =
  Prisma.validator<Prisma.AttendanceRecordSelect>()({
    id: true,
    attendanceSessionId: true,
    studentId: true,
    date: true,
    status: true,
    customStatusId: true,
    customStatus: {
      select: {
        id: true,
        label: true,
        behavior: true,
        isActive: true,
      },
    },
    remark: true,
    createdAt: true,
    updatedAt: true,
    student: {
      select: safeUserSelect,
    },
    attendanceSession: {
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
        takenById: true,
        date: true,
        scopeType: true,
        scopeLabel: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        school: {
          select: schoolSummarySelect,
        },
        schoolYear: {
          select: schoolYearSummarySelect,
        },
        takenBy: {
          select: safeUserSelect,
        },
        classes: {
          select: {
            id: true,
            attendanceSessionId: true,
            classId: true,
            createdAt: true,
            class: {
              select: attendanceClassSummarySelect,
            },
          },
        },
      },
    },
  });

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDateOnly(input: string): Date {
    return parseDateOnlyOrThrow(input, 'date');
  }

  private isAdminLike(role: UserRole) {
    return isBypassRole(role) || isSchoolAdminRole(role);
  }

  private isTeacherLike(role: UserRole) {
    return isTeacherRole(role);
  }

  private isAttendanceStatus(status: string): status is AttendanceStatus {
    return Object.values(AttendanceStatus).includes(status as AttendanceStatus);
  }

  private normalizeCustomStatusId(value?: string | null) {
    const trimmed = value?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
  }

  private getStatusForBehavior(behavior: AttendanceStatusCountBehavior) {
    if (behavior === AttendanceStatusCountBehavior.ABSENT) {
      return AttendanceStatus.ABSENT;
    }

    if (behavior === AttendanceStatusCountBehavior.LATE) {
      return AttendanceStatus.LATE;
    }

    if (behavior === AttendanceStatusCountBehavior.PRESENT) {
      return AttendanceStatus.PRESENT;
    }

    return AttendanceStatus.EXCUSED;
  }

  private async getActiveCustomStatusMapForSchool(
    schoolId: string,
    statusIds: string[],
  ): Promise<AttendanceCustomStatusMap> {
    const uniqueStatusIds = [...new Set(statusIds.filter(Boolean))];
    const map: AttendanceCustomStatusMap = new Map();

    if (uniqueStatusIds.length === 0) {
      return map;
    }

    const statuses = await this.prisma.attendanceCustomStatus.findMany({
      where: {
        id: { in: uniqueStatusIds },
        schoolId,
      },
      select: {
        id: true,
        label: true,
        behavior: true,
        isActive: true,
      },
    });

    for (const status of statuses) {
      map.set(status.id, status);
    }

    return map;
  }

  private resolveRecordStatus(
    record: {
      studentId: string;
      status: AttendanceStatus;
      customStatusId?: string | null;
      remark?: string | null;
    },
    customStatusesById: AttendanceCustomStatusMap,
  ) {
    const normalizedCustomStatusId = this.normalizeCustomStatusId(
      record.customStatusId,
    );
    const customStatus = normalizedCustomStatusId
      ? customStatusesById.get(normalizedCustomStatusId)
      : null;

    if (normalizedCustomStatusId && !customStatus) {
      throw new BadRequestException(
        `Invalid custom attendance status for student ${record.studentId}`,
      );
    }

    const status = customStatus
      ? this.getStatusForBehavior(customStatus.behavior)
      : record.status;

    return {
      studentId: record.studentId,
      status,
      customStatusId: normalizedCustomStatusId,
      remark: record.remark ?? null,
    };
  }

  private buildDefaultStatusRules() {
    return Object.entries(defaultStatusBehaviorByStatus).map(
      ([status, behavior]) => ({
        status: status as AttendanceStatus,
        behavior,
      }),
    );
  }

  private buildBehaviorMapFromRules(rules: AttendanceStatusRuleValue[]) {
    const map = new Map<AttendanceStatus, AttendanceStatusCountBehavior>();
    for (const rule of rules) {
      map.set(rule.status, rule.behavior);
    }

    for (const [status, behavior] of Object.entries(defaultStatusBehaviorByStatus)) {
      if (!map.has(status as AttendanceStatus)) {
        map.set(status as AttendanceStatus, behavior);
      }
    }

    return map;
  }

  private async getStatusRulesForSchool(schoolId: string) {
    const defaults = this.buildDefaultStatusRules();

    try {
      const rules = await this.prisma.attendanceStatusRule.findMany({
        where: { schoolId },
        select: {
          status: true,
          behavior: true,
        },
      });

      if (rules.length === 0) {
        return defaults;
      }

      return defaults.map((entry) => ({
        ...entry,
        behavior:
          rules.find((rule) => rule.status === entry.status)?.behavior ??
          entry.behavior,
      }));
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return defaults;
      }

      throw error;
    }
  }

  private async getStatusBehaviorMapForSchool(schoolId: string) {
    const rules = await this.getStatusRulesForSchool(schoolId);
    return this.buildBehaviorMapFromRules(rules);
  }

  private async getStatusBehaviorMapsForSchools(schoolIds: string[]) {
    const uniqueSchoolIds = [...new Set(schoolIds.filter(Boolean))];
    const map = new Map<string, Map<AttendanceStatus, AttendanceStatusCountBehavior>>();

    if (uniqueSchoolIds.length === 0) {
      return map;
    }

    for (const schoolId of uniqueSchoolIds) {
      map.set(schoolId, await this.getStatusBehaviorMapForSchool(schoolId));
    }

    return map;
  }

  private buildActiveSupplyAssignmentWhere(now = new Date()) {
    return {
      assignmentType: TeacherClassAssignmentType.SUPPLY,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    } satisfies Prisma.TeacherClassAssignmentWhereInput;
  }

  private buildTeacherAssignmentAccessFilter(role: UserRole, now = new Date()) {
    if (role !== UserRole.SUPPLY_TEACHER) {
      return {} satisfies Prisma.TeacherClassAssignmentWhereInput;
    }

    return {
      OR: [
        { assignmentType: TeacherClassAssignmentType.REGULAR },
        this.buildActiveSupplyAssignmentWhere(now),
      ],
    } satisfies Prisma.TeacherClassAssignmentWhereInput;
  }

  private summarizeByStatusRules(
    records: Array<{
      status: AttendanceStatus;
      schoolId: string;
      customBehavior?: AttendanceStatusCountBehavior | null;
    }>,
    behaviorBySchoolId: Map<
      string,
      Map<AttendanceStatus, AttendanceStatusCountBehavior>
    >,
  ) {
    const summary = {
      totalSessions: records.length,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
    };

    let countAsPresent = 0;
    let countAsAbsent = 0;
    let countAsLate = 0;

    for (const record of records) {
      switch (record.status) {
        case AttendanceStatus.PRESENT:
          summary.presentCount += 1;
          break;
        case AttendanceStatus.ABSENT:
          summary.absentCount += 1;
          break;
        case AttendanceStatus.LATE:
          summary.lateCount += 1;
          break;
        case AttendanceStatus.EXCUSED:
          break;
      }

      const statusBehavior =
        record.customBehavior ??
        behaviorBySchoolId.get(record.schoolId)?.get(record.status) ??
        defaultStatusBehaviorByStatus[record.status];

      if (statusBehavior === AttendanceStatusCountBehavior.PRESENT) {
        countAsPresent += 1;
        continue;
      }

      if (statusBehavior === AttendanceStatusCountBehavior.LATE) {
        countAsLate += 1;
        continue;
      }

      if (statusBehavior === AttendanceStatusCountBehavior.ABSENT) {
        countAsAbsent += 1;
      }
    }

    const countableTotal = countAsPresent + countAsLate + countAsAbsent;
    const attendancePercentage =
      countableTotal === 0
        ? null
        : Number((((countAsPresent + countAsLate) / countableTotal) * 100).toFixed(2));

    return {
      ...summary,
      attendancePercentage,
      attendanceRate: attendancePercentage,
    };
  }

  private async ensureUserCanReadStatusRules(
    user: AuthUser,
    schoolId: string,
  ) {
    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);
      return;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException(
        'You do not have access to attendance status rules',
      );
    }

    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: {
        teacherId: user.id,
        ...this.buildTeacherAssignmentAccessFilter(user.role),
        class: {
          schoolId,
        },
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'You do not have access to attendance status rules',
      );
    }
  }

  private async ensureUserCanManageStatusRules(
    user: AuthUser,
    schoolId: string,
  ) {
    if (!this.isAdminLike(user.role)) {
      throw new ForbiddenException(
        'You do not have access to attendance status rules',
      );
    }

    ensureUserHasSchoolAccess(user, schoolId);
  }

  private async ensureUserCanAccessClasses(user: AuthUser, classIds: string[]) {
    if (isBypassRole(user.role)) {
      return;
    }

    if (isSchoolAdminRole(user.role)) {
      const uniqueClassIds = [...new Set(classIds)];
      const classes = await Promise.all(
        uniqueClassIds.map((id) =>
          this.prisma.class.findUnique({
            where: { id },
            select: {
              id: true,
              schoolId: true,
            },
          }),
        ),
      );

      const accessibleSchoolIds = new Set(getAccessibleSchoolIds(user));
      const inaccessibleClass = classes.find((existingClass) => {
        if (!existingClass) {
          return true;
        }

        return !accessibleSchoolIds.has(existingClass.schoolId);
      });

      if (inaccessibleClass) {
        throw new ForbiddenException('You do not have access to these classes');
      }

      return;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have access to these classes');
    }

    const assignments = await this.prisma.teacherClassAssignment.findMany({
      where: {
        teacherId: user.id,
        classId: { in: classIds },
        ...this.buildTeacherAssignmentAccessFilter(user.role),
      },
      select: {
        classId: true,
      },
    });

    const assignedClassIds = new Set(assignments.map((a) => a.classId));
    const missing = classIds.filter((id) => !assignedClassIds.has(id));

    if (missing.length > 0) {
      throw new ForbiddenException(
        'You are not assigned to one or more selected classes',
      );
    }
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
    });

    if (!link) {
      throw new ForbiddenException('You are not linked to this student');
    }
  }

  private async ensureTeacherCanAccessStudent(
    user: AuthUser,
    studentId: string,
  ) {
    if (this.isAdminLike(user.role)) {
      return;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have access to this student');
    }

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
        ...this.buildTeacherAssignmentAccessFilter(user.role),
      },
      select: {
        id: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have access to this student');
    }
  }

  private async ensureSchoolAdminCanAccessStudent(
    user: AuthUser,
    studentId: string,
  ) {
    if (isBypassRole(user.role)) {
      return;
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
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

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const accessibleSchoolIds = new Set(getAccessibleSchoolIds(user));
    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });
    const hasAccess = studentSchoolIds.some((schoolId) =>
      accessibleSchoolIds.has(schoolId),
    );

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this student');
    }
  }

  private async ensureUserCanAccessStudentAttendance(
    user: AuthUser,
    studentId: string,
  ) {
    if (user.role === 'STUDENT') {
      if (user.id !== studentId) {
        throw new ForbiddenException('You can only view your own attendance');
      }

      return;
    }

    if (user.role === 'PARENT') {
      await this.ensureParentLinkedToStudent(user.id, studentId);
      return;
    }

    if (isSchoolAdminRole(user.role)) {
      await this.ensureSchoolAdminCanAccessStudent(user, studentId);
      return;
    }

    if (!isBypassRole(user.role)) {
      await this.ensureTeacherCanAccessStudent(user, studentId);
    }
  }

  private normalizeDateRange(startDate: string, endDate: string) {
    if (!startDate) {
      throw new BadRequestException('startDate is required');
    }

    if (!endDate) {
      throw new BadRequestException('endDate is required');
    }

    const normalizedStartDate = this.normalizeDateOnly(startDate);
    const normalizedEndDate = this.normalizeDateOnly(endDate);

    if (normalizedStartDate > normalizedEndDate) {
      throw new BadRequestException('startDate cannot be after endDate');
    }

    return { normalizedStartDate, normalizedEndDate };
  }

  private async getTeacherAssignedClassIds(
    teacherId: string,
    classIds: string[],
    teacherRole: UserRole,
  ): Promise<Set<string>> {
    const uniqueClassIds = [...new Set(classIds)];

    if (uniqueClassIds.length === 0) {
      return new Set<string>();
    }

    const assignments = await this.prisma.teacherClassAssignment.findMany({
      where: {
        teacherId,
        classId: { in: uniqueClassIds },
        ...this.buildTeacherAssignmentAccessFilter(teacherRole),
      },
      select: {
        classId: true,
      },
    });

    return new Set(assignments.map((assignment) => assignment.classId));
  }

  private async getWritableClassIdsForSession(
    user: AuthUser,
    classIds: string[],
  ): Promise<string[]> {
    if (this.isAdminLike(user.role) || isBypassRole(user.role)) {
      await this.ensureUserCanAccessClasses(user, classIds);
      return classIds;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have access to these classes');
    }

    const assignedClassIds = await this.getTeacherAssignedClassIds(
      user.id,
      classIds,
      user.role,
    );
    const writableClassIds = classIds.filter((classId) =>
      assignedClassIds.has(classId),
    );

    if (writableClassIds.length === 0) {
      throw new ForbiddenException(
        'You are not assigned to one or more selected classes',
      );
    }

    return writableClassIds;
  }

  private async getWritableClassIdsForRequestedScope(
    user: AuthUser,
    classIds: string[],
  ): Promise<string[]> {
    const uniqueClassIds = [...new Set(classIds)];
    await this.ensureUserCanAccessClasses(user, uniqueClassIds);
    return uniqueClassIds;
  }

  private buildAttachSessionClassesOperation(
    sessionId: string,
    existingClassIds: string[],
    writableClassIds: string[],
  ) {
    const existingClassIdSet = new Set(existingClassIds);
    const missingClassIds = writableClassIds.filter(
      (classId) => !existingClassIdSet.has(classId),
    );

    if (missingClassIds.length === 0) {
      return null;
    }

    return this.prisma.attendanceSession.update({
      where: { id: sessionId },
      data: {
        classes: {
          create: missingClassIds.map((classId) => ({
            classId,
          })),
        },
      },
      select: {
        id: true,
      },
    });
  }

  private async getStudentIdsForClasses(
    classIds: string[],
  ): Promise<Set<string>> {
    const uniqueClassIds = [...new Set(classIds)];

    if (uniqueClassIds.length === 0) {
      return new Set<string>();
    }

    const enrollments = await this.prisma.studentClassEnrollment.findMany({
      where: {
        classId: { in: uniqueClassIds },
      },
      select: {
        studentId: true,
      },
    });

    return new Set(enrollments.map((enrollment) => enrollment.studentId));
  }

  private async sanitizeAttendanceRecordForTeacher<
    T extends RecordWithSessionClasses,
  >(teacherId: string, teacherRole: UserRole, record: T): Promise<T> {
    const assignedClassIds = await this.getTeacherAssignedClassIds(
      teacherId,
      record.attendanceSession.classes.map(
        (sessionClass) => sessionClass.classId,
      ),
      teacherRole,
    );

    if (assignedClassIds.size === 0) {
      throw new ForbiddenException(
        'You do not have access to this attendance record',
      );
    }

    return {
      ...record,
      attendanceSession: {
        ...record.attendanceSession,
        classes: record.attendanceSession.classes.filter((sessionClass) =>
          assignedClassIds.has(sessionClass.classId),
        ),
      },
    };
  }

  private async sanitizeAttendanceRecordsForTeacher<
    T extends RecordWithSessionClasses,
  >(teacherId: string, teacherRole: UserRole, records: T[]): Promise<T[]> {
    const assignedClassIds = await this.getTeacherAssignedClassIds(
      teacherId,
      records.flatMap((record) =>
        record.attendanceSession.classes.map(
          (sessionClass) => sessionClass.classId,
        ),
      ),
      teacherRole,
    );

    return records
      .map((record) => ({
        ...record,
        attendanceSession: {
          ...record.attendanceSession,
          classes: record.attendanceSession.classes.filter((sessionClass) =>
            assignedClassIds.has(sessionClass.classId),
          ),
        },
      }))
      .filter((record) => record.attendanceSession.classes.length > 0);
  }

  private async sanitizeAttendanceSessionsForTeacher<
    T extends AttendanceSessionWithClassesAndRecords,
  >(teacherId: string, teacherRole: UserRole, sessions: T[]): Promise<T[]> {
    const assignedClassIds = await this.getTeacherAssignedClassIds(
      teacherId,
      sessions.flatMap((session) =>
        session.classes.map((sessionClass) => sessionClass.classId),
      ),
      teacherRole,
    );

    const allowedStudentIds = await this.getStudentIdsForClasses(
      Array.from(assignedClassIds),
    );

    return sessions
      .map((session) => ({
        ...session,
        classes: session.classes.filter((sessionClass) =>
          assignedClassIds.has(sessionClass.classId),
        ),
        records: session.records.filter((record) =>
          allowedStudentIds.has(record.studentId),
        ),
      }))
      .filter((session) => session.classes.length > 0);
  }

  private async sanitizeAttendanceSessionForTeacher<
    T extends AttendanceSessionWithClassesAndRecords,
  >(teacherId: string, teacherRole: UserRole, session: T): Promise<T> {
    const [sanitized] = await this.sanitizeAttendanceSessionsForTeacher(
      teacherId,
      teacherRole,
      [session],
    );

    if (!sanitized) {
      throw new ForbiddenException(
        'You do not have access to this attendance session',
      );
    }

    return sanitized;
  }

  private async getAttendanceSessionOrThrow(sessionId: string) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      select: attendanceSessionSelect,
    });

    if (!session) {
      throw new NotFoundException('Attendance session not found');
    }

    return session;
  }

  private validateAttendanceRecords(
    records: {
      studentId: string;
      status: AttendanceStatus;
      customStatusId?: string | null;
      remark?: string | null;
    }[],
    allowedStudentIds: Set<string>,
    customStatusesById: AttendanceCustomStatusMap,
  ) {
    const seenStudentIds = new Set<string>();

    for (const record of records) {
      if (seenStudentIds.has(record.studentId)) {
        throw new BadRequestException(
          `Duplicate studentId in request: ${record.studentId}`,
        );
      }

      seenStudentIds.add(record.studentId);

      if (!allowedStudentIds.has(record.studentId)) {
        throw new BadRequestException(
          `Student ${record.studentId} is not enrolled in the selected class set`,
        );
      }

      if (!Object.values(AttendanceStatus).includes(record.status)) {
        throw new BadRequestException(
          `Invalid attendance status for student ${record.studentId}`,
        );
      }

      const normalizedCustomStatusId = this.normalizeCustomStatusId(
        record.customStatusId,
      );

      if (
        normalizedCustomStatusId &&
        !customStatusesById.has(normalizedCustomStatusId)
      ) {
        throw new BadRequestException(
          `Invalid custom attendance status for student ${record.studentId}`,
        );
      }
    }
  }

  private async findExistingSessionForClassDate(
    schoolId: string,
    classId: string,
    date: Date,
  ) {
    return this.prisma.attendanceSession.findFirst({
      where: {
        schoolId,
        date,
        classes: {
          some: {
            classId,
          },
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private async findExistingSessionForStudentDate(
    schoolId: string,
    date: Date,
    attendanceSessionIds: string[],
  ) {
    const uniqueSessionIds = [...new Set(attendanceSessionIds)];

    if (uniqueSessionIds.length === 0) {
      return null;
    }

    return this.prisma.attendanceSession.findFirst({
      where: {
        id: {
          in: uniqueSessionIds,
        },
        schoolId,
        date,
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getStudentsForClasses(user: AuthUser, classIds: string[]) {
    if (!classIds.length) {
      throw new BadRequestException('classIds is required');
    }

    await this.ensureUserCanAccessClasses(user, classIds);

    const classes = await this.prisma.class.findMany({
      where: {
        id: { in: classIds },
        isActive: true,
      },
      include: {
        students: {
          select: {
            student: {
              select: safeUserSelect,
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    if (classes.length === 0) {
      throw new NotFoundException('No active classes found');
    }

    const studentMap = new Map<
      string,
      {
        id: string;
        firstName: string;
        lastName: string;
        username: string;
        email: string | null;
        classIds: string[];
        classNames: string[];
      }
    >();

    for (const cls of classes) {
      for (const enrollment of cls.students) {
        const student = enrollment.student;

        if (!studentMap.has(student.id)) {
          studentMap.set(student.id, {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            username: student.username,
            email: student.email,
            classIds: [],
            classNames: [],
          });
        }

        const current = studentMap.get(student.id)!;
        current.classIds.push(cls.id);
        current.classNames.push(cls.name);
      }
    }

    return {
      classes: classes.map((cls) => ({
        id: cls.id,
        name: cls.name,
        subject: cls.subject,
        isHomeroom: cls.isHomeroom,
      })),
      students: Array.from(studentMap.values()).sort((a, b) => {
        const last = a.lastName.localeCompare(b.lastName);
        if (last !== 0) return last;
        return a.firstName.localeCompare(b.firstName);
      }),
    };
  }

  async create(user: AuthUser, dto: CreateAttendanceDto) {
    const normalizedDate = this.normalizeDateOnly(dto.date);
    const uniqueClassIds: string[] = [...new Set(dto.classIds)];

    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, dto.schoolId);
    }
    await this.ensureUserCanAccessClasses(user, uniqueClassIds);

    if (dto.schoolYearId) {
      const schoolYear = await this.prisma.schoolYear.findUnique({
        where: { id: dto.schoolYearId },
        select: {
          id: true,
          schoolId: true,
        },
      });

      if (!schoolYear) {
        throw new NotFoundException('School year not found');
      }

      if (schoolYear.schoolId !== dto.schoolId) {
        throw new BadRequestException(
          'schoolYearId does not belong to schoolId',
        );
      }
    }

    const classes = await this.prisma.class.findMany({
      where: {
        id: { in: uniqueClassIds },
        schoolId: dto.schoolId,
        isActive: true,
      },
      include: {
        students: true,
      },
    });

    if (classes.length !== uniqueClassIds.length) {
      throw new BadRequestException(
        'One or more classes were not found, inactive, or not in the selected school',
      );
    }

    const allowedStudentIds = new Set<string>();
    for (const cls of classes) {
      for (const enrollment of cls.students) {
        allowedStudentIds.add(enrollment.studentId);
      }
    }

    const customStatusesById = await this.getActiveCustomStatusMapForSchool(
      dto.schoolId,
      dto.records
        .map((record) => this.normalizeCustomStatusId(record.customStatusId))
        .filter((statusId): statusId is string => Boolean(statusId)),
    );

    this.validateAttendanceRecords(
      dto.records,
      allowedStudentIds,
      customStatusesById,
    );
    const normalizedRecords = dto.records.map((record) =>
      this.resolveRecordStatus(record, customStatusesById),
    );

    if (uniqueClassIds.length === 1) {
      const existingSession = await this.findExistingSessionForClassDate(
        dto.schoolId,
        uniqueClassIds[0],
        normalizedDate,
      );

      if (existingSession) {
        return this.updateSessionWithScope(
          user,
          existingSession.id,
          {
            records: dto.records,
          },
          uniqueClassIds,
        );
      }
    }

    const existingRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        studentId: { in: normalizedRecords.map((record) => record.studentId) },
        date: normalizedDate,
      },
      select: {
        id: true,
        attendanceSessionId: true,
        studentId: true,
      },
    });

    if (existingRecords.length > 0) {
      if (uniqueClassIds.length === 1) {
        const existingSession = await this.findExistingSessionForStudentDate(
          dto.schoolId,
          normalizedDate,
          existingRecords.map((record) => record.attendanceSessionId),
        );

        if (existingSession) {
          return this.updateSessionWithScope(
            user,
            existingSession.id,
            {
              records: dto.records,
            },
            uniqueClassIds,
          );
        }
      }

      throw new ConflictException({
        message: 'One or more students already have attendance for this date',
        conflicts: existingRecords,
      });
    }

    return this.prisma.attendanceSession.create({
      data: {
        schoolId: dto.schoolId,
        schoolYearId: dto.schoolYearId ?? null,
        takenById: user.id,
        date: normalizedDate,
        scopeType:
          dto.scopeType ??
          (uniqueClassIds.length === 1
            ? AttendanceScopeType.CLASS
            : AttendanceScopeType.MULTI_CLASS),
        scopeLabel: dto.scopeLabel ?? null,
        notes: dto.notes ?? null,
        classes: {
          create: uniqueClassIds.map((classId) => ({
            classId,
          })),
        },
        records: {
          create: normalizedRecords.map((record) => ({
            studentId: record.studentId,
            date: normalizedDate,
            status: record.status,
            customStatusId: record.customStatusId,
            remark: record.remark ?? null,
          })),
        },
      },
      select: attendanceSessionSelect,
    });
  }

  private async updateSessionWithScope(
    user: AuthUser,
    sessionId: string,
    dto: UpdateAttendanceSessionDto,
    scopeClassIds?: string[],
  ) {
    const existingSession = await this.getAttendanceSessionOrThrow(sessionId);
    const existingClassIds = existingSession.classes.map(
      (sessionClass) => sessionClass.classId,
    );
    const writableClassIds =
      scopeClassIds && scopeClassIds.length > 0
        ? await this.getWritableClassIdsForRequestedScope(user, scopeClassIds)
        : await this.getWritableClassIdsForSession(user, existingClassIds);
    const allowedStudentIds = await this.getStudentIdsForClasses(
      writableClassIds,
    );
    const customStatusesById = await this.getActiveCustomStatusMapForSchool(
      existingSession.schoolId,
      dto.records
        .map((record) => this.normalizeCustomStatusId(record.customStatusId))
        .filter((statusId): statusId is string => Boolean(statusId)),
    );
    this.validateAttendanceRecords(
      dto.records,
      allowedStudentIds,
      customStatusesById,
    );
    const normalizedRecords = dto.records.map((record) =>
      this.resolveRecordStatus(record, customStatusesById),
    );

    const attachSessionClassesOperation = this.buildAttachSessionClassesOperation(
      sessionId,
      existingClassIds,
      writableClassIds,
    );

    await this.prisma.$transaction(
      [
        ...(attachSessionClassesOperation ? [attachSessionClassesOperation] : []),
        ...normalizedRecords.map((record) =>
          this.prisma.attendanceRecord.upsert({
            where: {
              attendanceSessionId_studentId: {
                attendanceSessionId: sessionId,
                studentId: record.studentId,
              },
            },
            update: {
              status: record.status,
              customStatusId: record.customStatusId,
              remark: record.remark ?? null,
            },
            create: {
              attendanceSessionId: sessionId,
              studentId: record.studentId,
              date: existingSession.date,
              status: record.status,
              customStatusId: record.customStatusId,
              remark: record.remark ?? null,
            },
          }),
        ),
      ],
    );

    return this.getSessionById(user, sessionId);
  }

  async updateSession(
    user: AuthUser,
    sessionId: string,
    dto: UpdateAttendanceSessionDto,
  ) {
    return this.updateSessionWithScope(user, sessionId, dto);
  }

  async getSessionsByDate(user: AuthUser, schoolId: string, date: string) {
    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    if (!date) {
      throw new BadRequestException('date is required');
    }

    const normalizedDate = this.normalizeDateOnly(date);

    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);

      return this.prisma.attendanceSession.findMany({
        where: {
          schoolId,
          date: normalizedDate,
        },
        select: attendanceSessionSelect,
        orderBy: {
          createdAt: 'desc',
        },
      });
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException(
        'You do not have access to attendance sessions',
      );
    }

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        schoolId,
        date: normalizedDate,
        classes: {
          some: {
            class: {
              teachers: {
                some: {
                  teacherId: user.id,
                  ...this.buildTeacherAssignmentAccessFilter(user.role),
                },
              },
            },
          },
        },
      },
      select: attendanceSessionSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return this.sanitizeAttendanceSessionsForTeacher(
      user.id,
      user.role,
      sessions,
    );
  }

  async getSessionById(user: AuthUser, sessionId: string) {
    const session = await this.getAttendanceSessionOrThrow(sessionId);

    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, session.schoolId);
      return session;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException(
        'You do not have access to attendance sessions',
      );
    }

    return this.sanitizeAttendanceSessionForTeacher(
      user.id,
      user.role,
      session,
    );
  }

  async getClassRecordsByDateRange(
    user: AuthUser,
    classId: string,
    startDate: string,
    endDate: string,
  ) {
    await this.ensureUserCanAccessClasses(user, [classId]);
    const { normalizedStartDate, normalizedEndDate } = this.normalizeDateRange(
      startDate,
      endDate,
    );

    const [classContext, roster] = await Promise.all([
      this.prisma.class.findUnique({
        where: { id: classId },
        select: { id: true, schoolId: true, schoolYearId: true, name: true },
      }),
      this.prisma.studentClassEnrollment.findMany({
        where: { classId },
        select: { studentId: true },
      }),
    ]);

    if (!classContext) {
      throw new NotFoundException('Class not found');
    }

    const classStudentIds = roster.map((entry) => entry.studentId);
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        schoolId: classContext.schoolId,
        date: {
          gte: normalizedStartDate,
          lte: normalizedEndDate,
        },
        classes: {
          some: {
            classId,
          },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
        date: true,
        scopeType: true,
        scopeLabel: true,
        createdAt: true,
        updatedAt: true,
        takenBy: {
          select: safeUserSelect,
        },
        records: {
          where: {
            studentId: { in: classStudentIds },
          },
          orderBy: attendanceSessionRecordOrderBy,
          select: {
            id: true,
            attendanceSessionId: true,
            studentId: true,
            status: true,
            customStatusId: true,
            customStatus: {
              select: {
                id: true,
                label: true,
                behavior: true,
                isActive: true,
              },
            },
            remark: true,
            date: true,
            updatedAt: true,
            student: {
              select: safeUserSelect,
            },
          },
        },
      },
    });

    const totalRecords = sessions.reduce(
      (sum, session) => sum + session.records.length,
      0,
    );

    return {
      classId,
      schoolId: classContext.schoolId,
      schoolYearId: classContext.schoolYearId,
      className: classContext.name,
      startDate: formatDateOnly(normalizedStartDate),
      endDate: formatDateOnly(normalizedEndDate),
      totalSessions: sessions.length,
      totalRecords,
      sessions,
    };
  }

  async getStatusRules(user: AuthUser, schoolId: string) {
    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    await this.ensureUserCanReadStatusRules(user, schoolId);
    const rules = await this.getStatusRulesForSchool(schoolId);

    return rules.map((rule) => ({
      schoolId,
      status: rule.status,
      behavior: rule.behavior,
    }));
  }

  async updateStatusRule(
    user: AuthUser,
    schoolId: string,
    status: string,
    behavior: AttendanceStatusCountBehavior,
  ) {
    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    await this.ensureUserCanManageStatusRules(user, schoolId);

    const normalizedStatus = status.trim().toUpperCase();
    if (!this.isAttendanceStatus(normalizedStatus)) {
      throw new BadRequestException('Invalid attendance status');
    }

    try {
      const updated = await this.prisma.attendanceStatusRule.upsert({
        where: {
          schoolId_status: {
            schoolId,
            status: normalizedStatus,
          },
        },
        update: {
          behavior,
        },
        create: {
          schoolId,
          status: normalizedStatus,
          behavior,
        },
        select: {
          schoolId: true,
          status: true,
          behavior: true,
        },
      });

      return updated;
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Attendance status rule migrations are required before managing status behavior. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  async getCustomStatuses(
    user: AuthUser,
    schoolId: string,
    includeInactive = false,
  ) {
    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    await this.ensureUserCanReadStatusRules(user, schoolId);

    try {
      return await this.prisma.attendanceCustomStatus.findMany({
        where: {
          schoolId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        select: {
          id: true,
          schoolId: true,
          label: true,
          behavior: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ isActive: 'desc' }, { label: 'asc' }],
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return [];
      }

      throw error;
    }
  }

  async createCustomStatus(user: AuthUser, dto: CreateAttendanceCustomStatusDto) {
    const schoolId = dto.schoolId?.trim();
    const label = dto.label?.trim();

    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    if (!label) {
      throw new BadRequestException('label is required');
    }

    await this.ensureUserCanManageStatusRules(user, schoolId);

    const existing = await this.prisma.attendanceCustomStatus.findFirst({
      where: {
        schoolId,
        label: { equals: label, mode: 'insensitive' },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new BadRequestException('A custom status with this label already exists');
    }

    try {
      return await this.prisma.attendanceCustomStatus.create({
        data: {
          schoolId,
          label,
          behavior: dto.behavior,
          isActive: dto.isActive ?? true,
        },
        select: {
          id: true,
          schoolId: true,
          label: true,
          behavior: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Attendance custom status migrations are required before managing custom statuses. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  async updateCustomStatus(
    user: AuthUser,
    customStatusId: string,
    dto: UpdateAttendanceCustomStatusDto,
  ) {
    const existing = await this.prisma.attendanceCustomStatus.findUnique({
      where: { id: customStatusId },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Attendance custom status not found');
    }

    await this.ensureUserCanManageStatusRules(user, existing.schoolId);

    const nextLabel = dto.label?.trim();
    if (dto.label !== undefined && !nextLabel) {
      throw new BadRequestException('label cannot be empty');
    }

    if (nextLabel) {
      const duplicate = await this.prisma.attendanceCustomStatus.findFirst({
        where: {
          schoolId: existing.schoolId,
          id: { not: customStatusId },
          label: { equals: nextLabel, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new BadRequestException(
          'A custom status with this label already exists',
        );
      }
    }

    try {
      return await this.prisma.attendanceCustomStatus.update({
        where: { id: customStatusId },
        data: {
          ...(nextLabel !== undefined ? { label: nextLabel } : {}),
          ...(dto.behavior !== undefined ? { behavior: dto.behavior } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        select: {
          id: true,
          schoolId: true,
          label: true,
          behavior: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Attendance custom status migrations are required before managing custom statuses. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  async getStudentAttendanceByDate(
    user: AuthUser,
    studentId: string,
    date: string,
  ) {
    if (!date) {
      throw new BadRequestException('date is required');
    }

    await this.ensureUserCanAccessStudentAttendance(user, studentId);

    const normalizedDate = this.normalizeDateOnly(date);

    const record = await this.prisma.attendanceRecord.findUnique({
      where: {
        studentId_date: {
          studentId,
          date: normalizedDate,
        },
      },
      select: attendanceRecordSelect,
    });

    if (!record) {
      throw new NotFoundException(
        'Attendance not found for this student and date',
      );
    }

    if (this.isTeacherLike(user.role)) {
      return this.sanitizeAttendanceRecordForTeacher(
        user.id,
        user.role,
        record,
      );
    }

    return record;
  }

  async getStudentHistory(user: AuthUser, studentId: string) {
    await this.ensureUserCanAccessStudentAttendance(user, studentId);

    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId },
      select: attendanceRecordSelect,
      orderBy: {
        date: 'desc',
      },
    });

    if (this.isTeacherLike(user.role)) {
      return this.sanitizeAttendanceRecordsForTeacher(
        user.id,
        user.role,
        records,
      );
    }

    return records;
  }

  async getStudentSummary(
    user: AuthUser,
    studentId: string,
    startDate: string,
    endDate: string,
  ) {
    await this.ensureUserCanAccessStudentAttendance(user, studentId);

    const { normalizedStartDate, normalizedEndDate } = this.normalizeDateRange(
      startDate,
      endDate,
    );

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        studentId,
        date: {
          gte: normalizedStartDate,
          lte: normalizedEndDate,
        },
      },
      select: {
        status: true,
        customStatus: {
          select: {
            behavior: true,
          },
        },
        attendanceSession: {
          select: {
            schoolId: true,
          },
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    const behaviorBySchoolId = await this.getStatusBehaviorMapsForSchools(
      records.map((record) => record.attendanceSession.schoolId),
    );

    const summarized = this.summarizeByStatusRules(
      records.map((record) => ({
        status: record.status,
        schoolId: record.attendanceSession.schoolId,
        customBehavior: record.customStatus?.behavior ?? null,
      })),
      behaviorBySchoolId,
    );

    return {
      studentId,
      startDate: formatDateOnly(normalizedStartDate),
      endDate: formatDateOnly(normalizedEndDate),
      totalDays: summarized.totalSessions,
      presentCount: summarized.presentCount,
      absentCount: summarized.absentCount,
      lateCount: summarized.lateCount,
      attendancePercentage: summarized.attendancePercentage ?? 0,
    };
  }

  async getStudentAllTimeSummary(user: AuthUser, studentId: string) {
    await this.ensureUserCanAccessStudentAttendance(user, studentId);

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        studentId,
      },
      select: {
        status: true,
        customStatus: {
          select: {
            behavior: true,
          },
        },
        attendanceSession: {
          select: {
            schoolId: true,
          },
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    const behaviorBySchoolId = await this.getStatusBehaviorMapsForSchools(
      records.map((record) => record.attendanceSession.schoolId),
    );
    const summary = this.summarizeByStatusRules(
      records.map((record) => ({
        status: record.status,
        schoolId: record.attendanceSession.schoolId,
        customBehavior: record.customStatus?.behavior ?? null,
      })),
      behaviorBySchoolId,
    );

    return {
      studentId,
      totalSessions: summary.totalSessions,
      presentCount: summary.presentCount,
      absentCount: summary.absentCount,
      lateCount: summary.lateCount,
      attendanceRate: summary.attendanceRate,
    };
  }

  async getClassAllTimeSummary(user: AuthUser, classId: string) {
    await this.ensureUserCanAccessClasses(user, [classId]);

    const classContext = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { schoolId: true },
    });

    if (!classContext) {
      throw new NotFoundException('Class not found');
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        attendanceSession: {
          schoolId: classContext.schoolId,
          classes: {
            some: {
              classId,
            },
          },
        },
      },
      select: {
        status: true,
        customStatus: {
          select: {
            behavior: true,
          },
        },
        attendanceSession: {
          select: {
            schoolId: true,
          },
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    const behaviorBySchoolId = await this.getStatusBehaviorMapsForSchools([
      classContext.schoolId,
    ]);
    const summary = this.summarizeByStatusRules(
      records.map((record) => ({
        status: record.status,
        schoolId: record.attendanceSession.schoolId,
        customBehavior: record.customStatus?.behavior ?? null,
      })),
      behaviorBySchoolId,
    );

    return {
      classId,
      totalSessions: summary.totalSessions,
      presentCount: summary.presentCount,
      absentCount: summary.absentCount,
      lateCount: summary.lateCount,
      attendanceRate: summary.attendanceRate,
    };
  }

  async getClassSummary(
    user: AuthUser,
    classId: string,
    startDate: string,
    endDate: string,
  ) {
    await this.ensureUserCanAccessClasses(user, [classId]);
    const { normalizedStartDate, normalizedEndDate } = this.normalizeDateRange(
      startDate,
      endDate,
    );

    const classContext = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { schoolId: true },
    });

    if (!classContext) {
      throw new NotFoundException('Class not found');
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        date: {
          gte: normalizedStartDate,
          lte: normalizedEndDate,
        },
        attendanceSession: {
          schoolId: classContext.schoolId,
          classes: {
            some: {
              classId,
            },
          },
        },
      },
      select: {
        status: true,
        customStatus: {
          select: {
            behavior: true,
          },
        },
        attendanceSession: {
          select: {
            schoolId: true,
          },
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    const behaviorBySchoolId = await this.getStatusBehaviorMapsForSchools([
      classContext.schoolId,
    ]);
    const summary = this.summarizeByStatusRules(
      records.map((record) => ({
        status: record.status,
        schoolId: record.attendanceSession.schoolId,
        customBehavior: record.customStatus?.behavior ?? null,
      })),
      behaviorBySchoolId,
    );

    return {
      classId,
      startDate: formatDateOnly(normalizedStartDate),
      endDate: formatDateOnly(normalizedEndDate),
      totalSessions: summary.totalSessions,
      presentCount: summary.presentCount,
      absentCount: summary.absentCount,
      lateCount: summary.lateCount,
      attendanceRate: summary.attendanceRate,
    };
  }

  async updateRecord(
    user: AuthUser,
    recordId: string,
    dto: UpdateAttendanceRecordDto,
  ) {
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { id: recordId },
      include: {
        attendanceSession: {
          include: {
            classes: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Attendance record not found');
    }

    const classIds = existing.attendanceSession.classes.map((c) => c.classId);
    await this.ensureUserCanAccessClasses(user, classIds);

    const customStatusesById = await this.getActiveCustomStatusMapForSchool(
      existing.attendanceSession.schoolId,
      [this.normalizeCustomStatusId(dto.customStatusId)].filter(
        (statusId): statusId is string => Boolean(statusId),
      ),
    );
    const resolved = this.resolveRecordStatus(
      {
        studentId: existing.studentId,
        status: dto.status,
        customStatusId: dto.customStatusId,
        remark: dto.remark ?? null,
      },
      customStatusesById,
    );

    return this.prisma.attendanceRecord.update({
      where: { id: recordId },
      data: {
        status: resolved.status,
        customStatusId: resolved.customStatusId,
        remark: resolved.remark ?? null,
      },
      select: attendanceRecordSelect,
    });
  }

  async deleteSession(user: AuthUser, sessionId: string) {
    const existing = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        classes: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Attendance session not found');
    }

    const classIds = existing.classes.map(
      (sessionClass) => sessionClass.classId,
    );
    await this.ensureUserCanAccessClasses(user, classIds);

    return this.prisma.attendanceSession.delete({
      where: { id: sessionId },
      select: attendanceSessionSelect,
    });
  }
}
