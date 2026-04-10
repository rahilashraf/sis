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

  private async ensureParentLinkedToStudent(parentId: string, studentId: string) {
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

  private async ensureTeacherCanAccessStudent(user: AuthUser, studentId: string) {
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
    const uniqueClassIds = [...new Set(dto.classIds)];

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
          orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
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
            orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have access to attendance sessions');
    }

    return this.prisma.attendanceSession.findMany({
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
          orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getStudentAttendanceByDate(user: AuthUser, studentId: string, date: string) {
    if (!date) {
      throw new BadRequestException('date is required');
    }

    if (user.role === 'STUDENT') {
      if (user.id !== studentId) {
        throw new ForbiddenException('You can only view your own attendance');
      }
    } else if (user.role === 'PARENT') {
      await this.ensureParentLinkedToStudent(user.id, studentId);
    } else if (!this.isAdminLike(user.role)) {
      await this.ensureTeacherCanAccessStudent(user, studentId);
    }

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
      throw new NotFoundException('Attendance not found for this student and date');
    }

    return record;
  }

  async getStudentHistory(user: AuthUser, studentId: string) {
    if (user.role === 'STUDENT') {
      if (user.id !== studentId) {
        throw new ForbiddenException('You can only view your own attendance');
      }
    } else if (user.role === 'PARENT') {
      await this.ensureParentLinkedToStudent(user.id, studentId);
    } else if (!this.isAdminLike(user.role)) {
      await this.ensureTeacherCanAccessStudent(user, studentId);
    }

    return this.prisma.attendanceRecord.findMany({
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
  }

  async updateRecord(user: AuthUser, recordId: string, dto: UpdateAttendanceRecordDto) {
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
}