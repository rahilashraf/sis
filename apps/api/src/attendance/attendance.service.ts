import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceScopeType,
  AttendanceStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';

type AuthUser = {
  id: string;
  role: UserRole;
};

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

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDateOnly(input: string): Date {
    const raw = new Date(input);

    if (Number.isNaN(raw.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    return new Date(
      Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()),
    );
  }

  private isAdminLike(role: UserRole) {
    return ['OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role);
  }

  private isTeacherLike(role: UserRole) {
    return ['TEACHER', 'SUPPLY_TEACHER'].includes(role);
  }

  private async ensureUserCanAccessClasses(user: AuthUser, classIds: string[]) {
    if (this.isAdminLike(user.role)) {
      return;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have access to these classes');
    }

    const assignments = await this.prisma.teacherClassAssignment.findMany({
      where: {
        teacherId: user.id,
        classId: { in: classIds },
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

    if (!this.isAdminLike(user.role)) {
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
  ): Promise<Set<string>> {
    const uniqueClassIds = [...new Set(classIds)];

    if (uniqueClassIds.length === 0) {
      return new Set<string>();
    }

    const assignments = await this.prisma.teacherClassAssignment.findMany({
      where: {
        teacherId,
        classId: { in: uniqueClassIds },
      },
      select: {
        classId: true,
      },
    });

    return new Set(assignments.map((assignment) => assignment.classId));
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
  >(teacherId: string, record: T): Promise<T> {
    const assignedClassIds = await this.getTeacherAssignedClassIds(
      teacherId,
      record.attendanceSession.classes.map(
        (sessionClass) => sessionClass.classId,
      ),
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
  >(teacherId: string, records: T[]): Promise<T[]> {
    const assignedClassIds = await this.getTeacherAssignedClassIds(
      teacherId,
      records.flatMap((record) =>
        record.attendanceSession.classes.map(
          (sessionClass) => sessionClass.classId,
        ),
      ),
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
  >(teacherId: string, sessions: T[]): Promise<T[]> {
    const assignedClassIds = await this.getTeacherAssignedClassIds(
      teacherId,
      sessions.flatMap((session) =>
        session.classes.map((sessionClass) => sessionClass.classId),
      ),
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
  >(teacherId: string, session: T): Promise<T> {
    const [sanitized] = await this.sanitizeAttendanceSessionsForTeacher(
      teacherId,
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
      include: {
        school: true,
        schoolYear: true,
        takenBy: true,
        classes: {
          include: {
            class: true,
          },
        },
        records: {
          include: {
            student: true,
          },
          orderBy: [
            { student: { lastName: 'asc' } },
            { student: { firstName: 'asc' } },
          ],
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Attendance session not found');
    }

    return session;
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
          include: {
            student: true,
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

    await this.ensureUserCanAccessClasses(user, uniqueClassIds);

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

    const seenStudentIds = new Set<string>();

    for (const record of dto.records) {
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
    }

    const existingRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        studentId: { in: dto.records.map((r) => r.studentId) },
        date: normalizedDate,
      },
      select: {
        id: true,
        studentId: true,
      },
    });

    if (existingRecords.length > 0) {
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
          create: dto.records.map((record) => ({
            studentId: record.studentId,
            date: normalizedDate,
            status: record.status,
            remark: record.remark ?? null,
          })),
        },
      },
      include: {
        school: true,
        schoolYear: true,
        takenBy: true,
        classes: {
          include: {
            class: true,
          },
        },
        records: {
          include: {
            student: true,
          },
          orderBy: [
            { student: { lastName: 'asc' } },
            { student: { firstName: 'asc' } },
          ],
        },
      },
    });
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
      return this.prisma.attendanceSession.findMany({
        where: {
          schoolId,
          date: normalizedDate,
        },
        include: {
          takenBy: true,
          classes: {
            include: {
              class: true,
            },
          },
          records: {
            include: {
              student: true,
            },
            orderBy: [
              { student: { lastName: 'asc' } },
              { student: { firstName: 'asc' } },
            ],
          },
        },
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
                },
              },
            },
          },
        },
      },
      include: {
        takenBy: true,
        classes: {
          include: {
            class: true,
          },
        },
        records: {
          include: {
            student: true,
          },
          orderBy: [
            { student: { lastName: 'asc' } },
            { student: { firstName: 'asc' } },
          ],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return this.sanitizeAttendanceSessionsForTeacher(user.id, sessions);
  }

  async getSessionById(user: AuthUser, sessionId: string) {
    const session = await this.getAttendanceSessionOrThrow(sessionId);

    if (this.isAdminLike(user.role)) {
      return session;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException(
        'You do not have access to attendance sessions',
      );
    }

    return this.sanitizeAttendanceSessionForTeacher(user.id, session);
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
      include: {
        student: true,
        attendanceSession: {
          include: {
            school: true,
            schoolYear: true,
            takenBy: true,
            classes: {
              include: {
                class: true,
              },
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException(
        'Attendance not found for this student and date',
      );
    }

    if (this.isTeacherLike(user.role)) {
      return this.sanitizeAttendanceRecordForTeacher(user.id, record);
    }

    return record;
  }

  async getStudentHistory(user: AuthUser, studentId: string) {
    await this.ensureUserCanAccessStudentAttendance(user, studentId);

    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId },
      include: {
        attendanceSession: {
          include: {
            school: true,
            schoolYear: true,
            takenBy: true,
            classes: {
              include: {
                class: true,
              },
            },
          },
        },
        student: true,
      },
      orderBy: {
        date: 'desc',
      },
    });

    if (this.isTeacherLike(user.role)) {
      return this.sanitizeAttendanceRecordsForTeacher(user.id, records);
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
      },
      orderBy: {
        date: 'asc',
      },
    });

    const summary = {
      totalDays: records.length,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      excusedCount: 0,
    };

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
          summary.excusedCount += 1;
          break;
      }
    }

    const attendedDays = summary.presentCount + summary.lateCount;
    const attendancePercentage =
      summary.totalDays === 0
        ? 0
        : Number(((attendedDays / summary.totalDays) * 100).toFixed(2));

    return {
      studentId,
      startDate: normalizedStartDate.toISOString().slice(0, 10),
      endDate: normalizedEndDate.toISOString().slice(0, 10),
      ...summary,
      attendancePercentage,
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

    return this.prisma.attendanceRecord.update({
      where: { id: recordId },
      data: {
        status: dto.status,
        remark: dto.remark ?? null,
      },
      include: {
        student: true,
        attendanceSession: {
          include: {
            classes: {
              include: {
                class: true,
              },
            },
            takenBy: true,
          },
        },
      },
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
      include: {
        school: true,
        schoolYear: true,
        takenBy: true,
        classes: {
          include: {
            class: true,
          },
        },
        records: {
          include: {
            student: true,
          },
          orderBy: [
            { student: { lastName: 'asc' } },
            { student: { firstName: 'asc' } },
          ],
        },
      },
    });
  }
}
