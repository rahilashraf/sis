import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TimetableService } from './timetable.service';

describe('TimetableService', () => {
  let service: TimetableService;
  let prisma: {
    user: { findUnique: jest.Mock };
    schoolYear: { findUnique: jest.Mock };
    class: { findMany: jest.Mock; findUnique: jest.Mock };
    timetableBlock: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    timetableBlockClass: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    teacherClassAssignment: { findFirst: jest.Mock };
    studentParentLink: { findUnique: jest.Mock };
    studentClassEnrollment: { findUnique: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };

  const owner = {
    id: 'owner-1',
    role: UserRole.OWNER,
    memberships: [{ schoolId: 'school-1', isActive: true }],
  } as const;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      schoolYear: { findUnique: jest.fn() },
      class: { findMany: jest.fn(), findUnique: jest.fn() },
      timetableBlock: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      timetableBlockClass: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      teacherClassAssignment: { findFirst: jest.fn() },
      studentParentLink: { findUnique: jest.fn() },
      studentClassEnrollment: { findUnique: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(prisma);
        }

        return Promise.all(arg as Promise<unknown>[]);
      }),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    service = new TimetableService(prisma as never, auditService as never);
  });

  function mockCreateHappyPath() {
    prisma.user.findUnique.mockResolvedValue({
      id: 'teacher-1',
      role: UserRole.TEACHER,
      schoolId: 'school-1',
      memberships: [],
    });
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'sy-1',
      schoolId: 'school-1',
    });
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', schoolId: 'school-1', schoolYearId: 'sy-1', name: 'A' },
      { id: 'class-2', schoolId: 'school-1', schoolYearId: 'sy-1', name: 'B' },
    ]);

    prisma.timetableBlock.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.timetableBlockClass.findMany.mockResolvedValue([]);

    prisma.timetableBlock.create.mockResolvedValue({
      id: 'block-1',
      schoolId: 'school-1',
      schoolYearId: 'sy-1',
      teacherId: 'teacher-1',
      dayOfWeek: 'MONDAY',
      startTime: '09:00',
      endTime: '10:00',
      roomLabel: 'R1',
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      school: { id: 'school-1', name: 'School', shortName: null },
      schoolYear: {
        id: 'sy-1',
        name: '2025-2026',
        startDate: new Date(),
        endDate: new Date(),
      },
      teacher: { id: 'teacher-1', role: 'TEACHER', memberships: [] },
      classes: [
        { id: 'link-1', classId: 'class-1', class: { id: 'class-1' } },
        { id: 'link-2', classId: 'class-2', class: { id: 'class-2' } },
      ],
    });
  }

  it('allows multiple classes in one block', async () => {
    mockCreateHappyPath();

    const result = await service.create(owner as never, {
      schoolId: 'school-1',
      schoolYearId: 'sy-1',
      teacherId: 'teacher-1',
      dayOfWeek: 'MONDAY',
      startTime: '09:00',
      endTime: '10:00',
      roomLabel: 'R1',
      classIds: ['class-1', 'class-2'],
    });

    expect(result.id).toBe('block-1');
    expect(prisma.timetableBlock.create).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TIMETABLE_BLOCK_CREATED' }),
    );
  });

  it('blocks teacher overlap across different blocks', async () => {
    mockCreateHappyPath();
    prisma.timetableBlock.findMany.mockReset();
    prisma.timetableBlock.findMany
      .mockResolvedValueOnce([{ id: 'other', startTime: '09:30', endTime: '10:30' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.create(owner as never, {
        schoolId: 'school-1',
        schoolYearId: 'sy-1',
        teacherId: 'teacher-1',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        endTime: '10:00',
        roomLabel: 'R1',
        classIds: ['class-1', 'class-2'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks class overlap across different blocks', async () => {
    mockCreateHappyPath();
    prisma.timetableBlock.findMany.mockReset();
    prisma.timetableBlock.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.timetableBlockClass.findMany.mockResolvedValue([
      {
        classId: 'class-1',
        timetableBlock: { id: 'other', startTime: '09:45', endTime: '10:15' },
      },
    ]);

    await expect(
      service.create(owner as never, {
        schoolId: 'school-1',
        schoolYearId: 'sy-1',
        teacherId: 'teacher-1',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        endTime: '10:00',
        roomLabel: 'R1',
        classIds: ['class-1', 'class-2'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks room overlap when roomLabel is provided', async () => {
    mockCreateHappyPath();
    prisma.timetableBlock.findMany.mockReset();
    prisma.timetableBlock.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'other', startTime: '09:40', endTime: '10:20' }]);

    await expect(
      service.create(owner as never, {
        schoolId: 'school-1',
        schoolYearId: 'sy-1',
        teacherId: 'teacher-1',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        endTime: '10:00',
        roomLabel: 'R1',
        classIds: ['class-1', 'class-2'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('parent cannot access unrelated student timetable', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      schoolId: 'school-1',
      memberships: [],
    });
    prisma.studentParentLink.findUnique.mockResolvedValue(null);

    await expect(
      service.listByStudent(
        {
          id: 'parent-1',
          role: UserRole.PARENT,
          memberships: [],
        } as never,
        'student-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('student cannot access another student timetable', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-2',
      role: UserRole.STUDENT,
      schoolId: 'school-1',
      memberships: [],
    });

    await expect(
      service.listByStudent(
        {
          id: 'student-1',
          role: UserRole.STUDENT,
          memberships: [],
        } as never,
        'student-2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('non-admin cannot mutate timetable', async () => {
    const teacherUser = {
      id: 'teacher-1',
      role: UserRole.TEACHER,
      memberships: [{ schoolId: 'school-1', isActive: true }],
    } as const;

    await expect(
      service.create(teacherUser as never, {
        schoolId: 'school-1',
        schoolYearId: 'sy-1',
        teacherId: 'teacher-1',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        endTime: '10:00',
        classIds: ['class-1'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.timetableBlock.findUnique.mockResolvedValue({
      id: 'block-1',
      schoolId: 'school-1',
      schoolYearId: 'sy-1',
      teacherId: 'teacher-1',
      dayOfWeek: 'MONDAY',
      startTime: '09:00',
      endTime: '10:00',
      roomLabel: null,
      notes: null,
      isActive: true,
      classes: [{ classId: 'class-1' }],
    });

    await expect(
      service.update(teacherUser as never, 'block-1', { notes: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.remove(teacherUser as never, 'block-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
