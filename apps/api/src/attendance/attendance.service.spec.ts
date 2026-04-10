import { ForbiddenException } from '@nestjs/common';
import { AttendanceStatus, UserRole } from '@prisma/client';
import { AttendanceService } from './attendance.service';

describe('AttendanceService access control', () => {
  let service: AttendanceService;
  let prisma: {
    teacherClassAssignment: { findMany: jest.Mock };
    studentParentLink: { findUnique: jest.Mock };
    studentClassEnrollment: { findFirst: jest.Mock; findMany: jest.Mock };
    attendanceSession: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    attendanceRecord: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      teacherClassAssignment: { findMany: jest.fn() },
      studentParentLink: { findUnique: jest.fn() },
      studentClassEnrollment: { findFirst: jest.fn(), findMany: jest.fn() },
      attendanceSession: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      attendanceRecord: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new AttendanceService(prisma as any);
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
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.ABSENT },
      { status: AttendanceStatus.LATE },
      { status: AttendanceStatus.EXCUSED },
      { status: AttendanceStatus.PRESENT },
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
      excusedCount: 1,
      attendancePercentage: 60,
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
