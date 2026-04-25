import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceStatus, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AttendanceService } from './attendance.service';

describe('AttendanceService access control', () => {
  let service: AttendanceService;
  let prisma: {
    class: { findMany: jest.Mock };
    schoolYear: { findUnique: jest.Mock };
    teacherClassAssignment: { findMany: jest.Mock; findFirst: jest.Mock };
    studentParentLink: { findUnique: jest.Mock };
    studentClassEnrollment: { findFirst: jest.Mock; findMany: jest.Mock };
    attendanceSession: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    attendanceRecord: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
    attendanceStatusRule: {
      findMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      class: { findMany: jest.fn() },
      schoolYear: { findUnique: jest.fn() },
      teacherClassAssignment: { findMany: jest.fn(), findFirst: jest.fn() },
      studentParentLink: { findUnique: jest.fn() },
      studentClassEnrollment: { findFirst: jest.fn(), findMany: jest.fn() },
      attendanceSession: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      attendanceRecord: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      attendanceStatusRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    prisma.teacherClassAssignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
    });

    service = new AttendanceService(
      prisma as any,
      auditService as unknown as AuditService,
    );
  });

  it('blocks attendance creation when the class does not take attendance', async () => {
    prisma.class.findMany
      .mockResolvedValueOnce([
        {
          id: 'class-a',
          schoolId: 'school-1',
          isActive: true,
          students: [{ studentId: 'student-1' }],
          takesAttendance: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'class-a',
          schoolId: 'school-1',
          isActive: true,
          students: [{ studentId: 'student-1' }],
          takesAttendance: false,
        },
      ]);
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
    });

    await expect(
      service.create(
        {
          id: 'owner-1',
          role: UserRole.OWNER,
          memberships: [],
        } as never,
        {
          schoolId: 'school-1',
          schoolYearId: 'year-1',
          date: '2026-04-09',
          classIds: ['class-a'],
          records: [
            {
              studentId: 'student-1',
              status: AttendanceStatus.PRESENT,
            },
          ],
        },
      ),
    ).rejects.toEqual(
      new BadRequestException('Attendance is not enabled for this class.'),
    );

    expect(prisma.attendanceSession.create).not.toHaveBeenCalled();
    expect(prisma.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it('blocks attendance session updates when the class does not take attendance', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      takenById: 'teacher-1',
      date: new Date('2026-04-09T00:00:00.000Z'),
      scopeType: 'CLASS',
      scopeLabel: null,
      notes: null,
      createdAt: new Date('2026-04-09T08:00:00.000Z'),
      updatedAt: new Date('2026-04-09T08:05:00.000Z'),
      school: { id: 'school-1', name: 'North School', shortName: 'NS', isActive: true },
      schoolYear: null,
      takenBy: null,
      classes: [
        {
          id: 'link-1',
          attendanceSessionId: 'session-1',
          classId: 'class-a',
          createdAt: new Date(),
          class: { id: 'class-a', name: 'Math' },
        },
      ],
      records: [],
    });
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-a',
        schoolId: 'school-1',
        takesAttendance: false,
      },
    ]);

    await expect(
      service.updateSession(
        {
          id: 'owner-1',
          role: UserRole.OWNER,
          memberships: [],
        } as never,
        'session-1',
        {
          records: [
            {
              studentId: 'student-1',
              status: AttendanceStatus.LATE,
            },
          ],
        },
      ),
    ).rejects.toEqual(
      new BadRequestException('Attendance is not enabled for this class.'),
    );

    expect(prisma.attendanceRecord.upsert).not.toHaveBeenCalled();
    expect(prisma.attendanceSession.update).not.toHaveBeenCalled();
  });

  it('updates an existing single-class attendance session when the same class and date is submitted again', async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-a',
        schoolId: 'school-1',
        isActive: true,
        takesAttendance: true,
        students: [{ studentId: 'student-1' }],
      },
    ]);
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
    });
    prisma.attendanceSession.findFirst.mockResolvedValue({
      id: 'session-1',
    });
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { studentId: 'student-1' },
    ]);
    prisma.attendanceRecord.upsert.mockResolvedValue({
      id: 'record-1',
    });
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      takenById: 'teacher-1',
      date: new Date('2026-04-09T00:00:00.000Z'),
      scopeType: 'CLASS',
      scopeLabel: null,
      notes: null,
      createdAt: new Date('2026-04-09T08:00:00.000Z'),
      updatedAt: new Date('2026-04-09T08:05:00.000Z'),
      school: { id: 'school-1', name: 'North School', shortName: 'NS', isActive: true },
      schoolYear: null,
      takenBy: null,
      classes: [{ id: 'link-1', attendanceSessionId: 'session-1', classId: 'class-a', createdAt: new Date(), class: { id: 'class-a' } }],
      records: [],
    });

    const result = await service.create(
      {
        id: 'owner-1',
        role: UserRole.OWNER,
        memberships: [],
      } as never,
      {
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        date: '2026-04-09',
        classIds: ['class-a'],
        records: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.PRESENT,
          },
        ],
      },
    );

    expect(prisma.attendanceSession.create).not.toHaveBeenCalled();
    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
    expect(prisma.attendanceSession.findFirst).toHaveBeenCalledWith({
      where: {
        schoolId: 'school-1',
        date: new Date('2026-04-09T00:00:00.000Z'),
        classes: {
          some: {
            classId: 'class-a',
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
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith({
      where: {
        attendanceSessionId_studentId: {
          attendanceSessionId: 'session-1',
          studentId: 'student-1',
        },
      },
      update: {
        customStatusId: null,
        status: AttendanceStatus.PRESENT,
        remark: null,
      },
      create: {
        attendanceSessionId: 'session-1',
        customStatusId: null,
        studentId: 'student-1',
        date: new Date('2026-04-09T00:00:00.000Z'),
        status: AttendanceStatus.PRESENT,
        remark: null,
      },
    });
    expect(result.id).toBe('session-1');
  });

  it('updates an existing single-class attendance session from duplicate student records when class lookup misses', async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-a',
        schoolId: 'school-1',
        isActive: true,
        takesAttendance: true,
        students: [{ studentId: 'student-1' }],
      },
    ]);
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
    });
    prisma.attendanceSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'session-legacy' });
    prisma.attendanceRecord.findMany.mockResolvedValue([
      {
        id: 'record-1',
        attendanceSessionId: 'session-legacy',
        studentId: 'student-1',
      },
    ]);
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { studentId: 'student-1' },
    ]);
    prisma.attendanceRecord.upsert.mockResolvedValue({
      id: 'record-1',
    });
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-legacy',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      takenById: 'teacher-1',
      date: new Date('2026-04-09T00:00:00.000Z'),
      scopeType: 'CLASS',
      scopeLabel: null,
      notes: null,
      createdAt: new Date('2026-04-09T08:00:00.000Z'),
      updatedAt: new Date('2026-04-09T08:05:00.000Z'),
      school: { id: 'school-1', name: 'North School', shortName: 'NS', isActive: true },
      schoolYear: null,
      takenBy: null,
      classes: [{ id: 'link-1', attendanceSessionId: 'session-legacy', classId: 'class-a', createdAt: new Date(), class: { id: 'class-a' } }],
      records: [],
    });

    const result = await service.create(
      {
        id: 'owner-1',
        role: UserRole.OWNER,
        memberships: [],
      } as never,
      {
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        date: '2026-04-09',
        classIds: ['class-a'],
        records: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.LATE,
          },
        ],
      },
    );

    expect(prisma.attendanceSession.create).not.toHaveBeenCalled();
    expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith({
      where: {
        studentId: { in: ['student-1'] },
        date: new Date('2026-04-09T00:00:00.000Z'),
      },
      select: {
        id: true,
        attendanceSessionId: true,
        studentId: true,
      },
    });
    expect(prisma.attendanceSession.findFirst).toHaveBeenLastCalledWith({
      where: {
        id: {
          in: ['session-legacy'],
        },
        schoolId: 'school-1',
        date: new Date('2026-04-09T00:00:00.000Z'),
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith({
      where: {
        attendanceSessionId_studentId: {
          attendanceSessionId: 'session-legacy',
          studentId: 'student-1',
        },
      },
      update: {
        customStatusId: null,
        status: AttendanceStatus.LATE,
        remark: null,
      },
      create: {
        attendanceSessionId: 'session-legacy',
        customStatusId: null,
        studentId: 'student-1',
        date: new Date('2026-04-09T00:00:00.000Z'),
        status: AttendanceStatus.LATE,
        remark: null,
      },
    });
    expect(result.id).toBe('session-legacy');
  });

  it('allows a teacher to update an existing shared session for their assigned class only', async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-a',
        schoolId: 'school-1',
        isActive: true,
        takesAttendance: true,
        students: [{ studentId: 'student-1' }],
      },
    ]);
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
    });
    prisma.teacherClassAssignment.findMany
      .mockResolvedValueOnce([{ classId: 'class-a' }])
      .mockResolvedValueOnce([{ classId: 'class-a' }])
      .mockResolvedValueOnce([{ classId: 'class-a' }]);
    prisma.attendanceSession.findFirst.mockResolvedValue({
      id: 'session-shared',
    });
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { studentId: 'student-1' },
    ]);
    prisma.attendanceRecord.upsert.mockResolvedValue({
      id: 'record-1',
    });
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-shared',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      takenById: 'teacher-2',
      date: new Date('2026-04-09T00:00:00.000Z'),
      scopeType: 'MULTI_CLASS',
      scopeLabel: null,
      notes: null,
      createdAt: new Date('2026-04-09T08:00:00.000Z'),
      updatedAt: new Date('2026-04-09T08:05:00.000Z'),
      school: { id: 'school-1', name: 'North School', shortName: 'NS', isActive: true },
      schoolYear: null,
      takenBy: null,
      classes: [
        { id: 'link-1', attendanceSessionId: 'session-shared', classId: 'class-a', createdAt: new Date(), class: { id: 'class-a', name: 'Math' } },
        { id: 'link-2', attendanceSessionId: 'session-shared', classId: 'class-b', createdAt: new Date(), class: { id: 'class-b', name: 'Science' } },
      ],
      records: [],
    });

    const result = await service.create(
      {
        id: 'teacher-1',
        role: UserRole.TEACHER,
      } as never,
      {
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        date: '2026-04-09',
        classIds: ['class-a'],
        records: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.PRESENT,
          },
        ],
      },
    );

    expect(prisma.attendanceSession.create).not.toHaveBeenCalled();
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith({
      where: {
        attendanceSessionId_studentId: {
          attendanceSessionId: 'session-shared',
          studentId: 'student-1',
        },
      },
      update: {
        customStatusId: null,
        status: AttendanceStatus.PRESENT,
        remark: null,
      },
      create: {
        attendanceSessionId: 'session-shared',
        customStatusId: null,
        studentId: 'student-1',
        date: new Date('2026-04-09T00:00:00.000Z'),
        status: AttendanceStatus.PRESENT,
        remark: null,
      },
    });
    expect(result.id).toBe('session-shared');
  });

  it('allows a teacher to update admin-created attendance via duplicate student resolution using the submitted class scope', async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-a',
        schoolId: 'school-1',
        isActive: true,
        takesAttendance: true,
        students: [{ studentId: 'student-1' }],
      },
    ]);
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
    });
    prisma.teacherClassAssignment.findMany
      .mockResolvedValueOnce([{ classId: 'class-a' }])
      .mockResolvedValueOnce([{ classId: 'class-a' }])
      .mockResolvedValueOnce([{ classId: 'class-a' }]);
    prisma.attendanceSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'session-admin' });
    prisma.attendanceRecord.findMany.mockResolvedValue([
      {
        id: 'record-1',
        attendanceSessionId: 'session-admin',
        studentId: 'student-1',
      },
    ]);
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { studentId: 'student-1' },
    ]);
    prisma.attendanceSession.update.mockResolvedValue({
      id: 'session-admin',
    });
    prisma.attendanceRecord.upsert.mockResolvedValue({
      id: 'record-1',
    });
    prisma.attendanceSession.findUnique
      .mockResolvedValueOnce({
        id: 'session-admin',
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        takenById: 'admin-1',
        date: new Date('2026-04-11T00:00:00.000Z'),
        scopeType: 'CLASS',
        scopeLabel: null,
        notes: null,
        createdAt: new Date('2026-04-11T08:00:00.000Z'),
        updatedAt: new Date('2026-04-11T08:05:00.000Z'),
        school: { id: 'school-1', name: 'North School', shortName: 'NS', isActive: true },
        schoolYear: null,
        takenBy: null,
        classes: [{ id: 'link-1', attendanceSessionId: 'session-admin', classId: 'class-b', createdAt: new Date(), class: { id: 'class-b', name: 'Science' } }],
        records: [],
      })
      .mockResolvedValueOnce({
        id: 'session-admin',
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        takenById: 'admin-1',
        date: new Date('2026-04-11T00:00:00.000Z'),
        scopeType: 'MULTI_CLASS',
        scopeLabel: null,
        notes: null,
        createdAt: new Date('2026-04-11T08:00:00.000Z'),
        updatedAt: new Date('2026-04-11T08:10:00.000Z'),
        school: { id: 'school-1', name: 'North School', shortName: 'NS', isActive: true },
        schoolYear: null,
        takenBy: null,
        classes: [
          { id: 'link-1', attendanceSessionId: 'session-admin', classId: 'class-b', createdAt: new Date(), class: { id: 'class-b', name: 'Science' } },
          { id: 'link-2', attendanceSessionId: 'session-admin', classId: 'class-a', createdAt: new Date(), class: { id: 'class-a', name: 'Math' } },
        ],
        records: [
          {
            studentId: 'student-1',
            student: { id: 'student-1', firstName: 'Ada' },
          },
        ],
      });

    const result = await service.create(
      {
        id: 'teacher-1',
        role: UserRole.TEACHER,
      } as never,
      {
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        date: '2026-04-11',
        classIds: ['class-a'],
        records: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.LATE,
          },
        ],
      },
    );

    expect(prisma.attendanceSession.update).toHaveBeenCalledWith({
      where: { id: 'session-admin' },
      data: {
        classes: {
          create: [{ classId: 'class-a' }],
        },
      },
      select: {
        id: true,
      },
    });
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith({
      where: {
        attendanceSessionId_studentId: {
          attendanceSessionId: 'session-admin',
          studentId: 'student-1',
        },
      },
      update: {
        customStatusId: null,
        status: AttendanceStatus.LATE,
        remark: null,
      },
      create: {
        attendanceSessionId: 'session-admin',
        customStatusId: null,
        studentId: 'student-1',
        date: new Date('2026-04-11T00:00:00.000Z'),
        status: AttendanceStatus.LATE,
        remark: null,
      },
    });
    expect(result.id).toBe('session-admin');
    expect(result.classes).toEqual([
      { id: 'link-2', attendanceSessionId: 'session-admin', classId: 'class-a', createdAt: expect.any(Date), class: { id: 'class-a', name: 'Math' } },
    ]);
  });

  it('prevents students from viewing another student attendance record', async () => {
    await expect(
      service.getStudentAttendanceByDate(
        { id: 'student-1', role: UserRole.STUDENT },
        'student-2',
        '2026-04-09',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.attendanceRecord.findUnique).not.toHaveBeenCalled();
  });

  it('prevents parents from viewing attendance for unlinked children', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue(null);

    await expect(
      service.getStudentAttendanceByDate(
        { id: 'parent-1', role: UserRole.PARENT },
        'student-1',
        '2026-04-09',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.attendanceRecord.findUnique).not.toHaveBeenCalled();
  });

  it('returns teacher-visible sessions and filters classes and records to assigned classes', async () => {
    prisma.attendanceSession.findMany.mockResolvedValue([
      {
        id: 'session-1',
        classes: [
          { classId: 'class-a', class: { id: 'class-a', name: 'Math' } },
          { classId: 'class-b', class: { id: 'class-b', name: 'Science' } },
        ],
        records: [
          {
            studentId: 'student-a',
            student: { id: 'student-a', firstName: 'Ada' },
          },
          {
            studentId: 'student-b',
            student: { id: 'student-b', firstName: 'Ben' },
          },
        ],
        takenBy: { id: 'teacher-2' },
      },
    ]);
    prisma.teacherClassAssignment.findMany.mockResolvedValue([
      { classId: 'class-a' },
    ]);
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { studentId: 'student-a' },
    ]);

    const result = await service.getSessionsByDate(
      { id: 'teacher-1', role: UserRole.TEACHER },
      'school-1',
      '2026-04-09',
    );

    expect(prisma.attendanceSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: 'school-1',
          date: expect.any(Date),
          classes: {
            some: {
              class: {
                teachers: {
                  some: {
                    teacherId: 'teacher-1',
                  },
                },
              },
            },
          },
        }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].classes).toEqual([
      { classId: 'class-a', class: { id: 'class-a', name: 'Math' } },
    ]);
    expect(result[0].records).toEqual([
      {
        studentId: 'student-a',
        student: { id: 'student-a', firstName: 'Ada' },
      },
    ]);
  });

  it('returns a single teacher-visible session filtered to assigned classes and students', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      classes: [
        { classId: 'class-a', class: { id: 'class-a', name: 'Math' } },
        { classId: 'class-b', class: { id: 'class-b', name: 'Science' } },
      ],
      records: [
        {
          studentId: 'student-a',
          student: { id: 'student-a', firstName: 'Ada' },
        },
        {
          studentId: 'student-b',
          student: { id: 'student-b', firstName: 'Ben' },
        },
      ],
      school: { id: 'school-1' },
      schoolYear: null,
      takenBy: { id: 'teacher-2' },
    });
    prisma.teacherClassAssignment.findMany.mockResolvedValue([
      { classId: 'class-a' },
    ]);
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { studentId: 'student-a' },
    ]);

    const result = await service.getSessionById(
      { id: 'teacher-1', role: UserRole.TEACHER },
      'session-1',
    );

    expect(result.classes).toEqual([
      { classId: 'class-a', class: { id: 'class-a', name: 'Math' } },
    ]);
    expect(result.records).toEqual([
      {
        studentId: 'student-a',
        student: { id: 'student-a', firstName: 'Ada' },
      },
    ]);
  });

  it('prevents teachers from viewing a student attendance record outside their assigned session classes', async () => {
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({
      id: 'enrollment-1',
    });
    prisma.attendanceRecord.findUnique.mockResolvedValue({
      id: 'record-1',
      status: AttendanceStatus.PRESENT,
      student: { id: 'student-1' },
      attendanceSession: {
        id: 'session-1',
        classes: [
          {
            classId: 'class-unassigned',
            class: { id: 'class-unassigned', name: 'Other Class' },
          },
        ],
      },
    });
    prisma.teacherClassAssignment.findMany.mockResolvedValue([]);

    await expect(
      service.getStudentAttendanceByDate(
        { id: 'teacher-1', role: UserRole.TEACHER },
        'student-1',
        '2026-04-09',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('filters teacher student history down to assigned session classes only', async () => {
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({
      id: 'enrollment-1',
    });
    prisma.attendanceRecord.findMany.mockResolvedValue([
      {
        id: 'record-1',
        status: AttendanceStatus.PRESENT,
        attendanceSession: {
          id: 'session-1',
          classes: [
            { classId: 'class-a', class: { id: 'class-a', name: 'Math' } },
            { classId: 'class-b', class: { id: 'class-b', name: 'Science' } },
          ],
        },
        student: { id: 'student-1' },
      },
      {
        id: 'record-2',
        status: AttendanceStatus.ABSENT,
        attendanceSession: {
          id: 'session-2',
          classes: [
            { classId: 'class-c', class: { id: 'class-c', name: 'History' } },
          ],
        },
        student: { id: 'student-1' },
      },
    ]);
    prisma.teacherClassAssignment.findMany.mockResolvedValue([
      { classId: 'class-a' },
    ]);

    const result = await service.getStudentHistory(
      { id: 'teacher-1', role: UserRole.TEACHER },
      'student-1',
    );

    expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: 'student-1' },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].attendanceSession.classes).toEqual([
      { classId: 'class-a', class: { id: 'class-a', name: 'Math' } },
    ]);
  });

  it('prevents teachers from updating records for sessions that include unassigned classes', async () => {
    prisma.attendanceRecord.findUnique.mockResolvedValue({
      id: 'record-1',
      attendanceSession: {
        classes: [{ classId: 'class-a' }, { classId: 'class-b' }],
      },
    });
    prisma.teacherClassAssignment.findMany.mockResolvedValue([
      { classId: 'class-a' },
    ]);

    await expect(
      service.updateRecord(
        { id: 'teacher-1', role: UserRole.TEACHER },
        'record-1',
        { status: AttendanceStatus.LATE, remark: 'Late arrival' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.attendanceRecord.update).not.toHaveBeenCalled();
  });

  it('prevents teachers from deleting sessions that include unassigned classes', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      classes: [{ classId: 'class-a' }, { classId: 'class-b' }],
    });
    prisma.teacherClassAssignment.findMany.mockResolvedValue([
      { classId: 'class-a' },
    ]);

    await expect(
      service.deleteSession(
        { id: 'teacher-1', role: UserRole.TEACHER },
        'session-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.attendanceSession.delete).not.toHaveBeenCalled();
  });

  it('returns summary counts for an allowed teacher date range', async () => {
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({
      id: 'enrollment-1',
    });
    prisma.attendanceRecord.findMany.mockResolvedValue([
      { status: AttendanceStatus.PRESENT, attendanceSession: { schoolId: 'school-1' } },
      { status: AttendanceStatus.ABSENT, attendanceSession: { schoolId: 'school-1' } },
      { status: AttendanceStatus.LATE, attendanceSession: { schoolId: 'school-1' } },
      { status: AttendanceStatus.EXCUSED, attendanceSession: { schoolId: 'school-1' } },
      { status: AttendanceStatus.PRESENT, attendanceSession: { schoolId: 'school-1' } },
    ]);

    const result = await service.getStudentSummary(
      { id: 'teacher-1', role: UserRole.TEACHER },
      'student-1',
      '2026-04-01',
      '2026-04-05',
    );

    expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith({
      where: {
        studentId: 'student-1',
        date: {
          gte: new Date('2026-04-01T00:00:00.000Z'),
          lte: new Date('2026-04-05T00:00:00.000Z'),
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
    expect(result).toEqual({
      studentId: 'student-1',
      startDate: '2026-04-01',
      endDate: '2026-04-05',
      totalDays: 5,
      presentCount: 2,
      absentCount: 1,
      lateCount: 1,
      attendancePercentage: 75,
    });
  });

  it('prevents parents from requesting summary for unlinked children', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue(null);

    await expect(
      service.getStudentSummary(
        { id: 'parent-1', role: UserRole.PARENT },
        'student-1',
        '2026-04-01',
        '2026-04-05',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('rejects summary date ranges where startDate is after endDate', async () => {
    await expect(
      service.getStudentSummary(
        { id: 'student-1', role: UserRole.STUDENT },
        'student-1',
        '2026-04-05',
        '2026-04-01',
      ),
    ).rejects.toThrow('startDate cannot be after endDate');

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });
});
