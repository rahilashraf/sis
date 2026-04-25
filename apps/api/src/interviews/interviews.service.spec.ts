import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { InterviewsService } from './interviews.service';

describe('InterviewsService', () => {
  let service: InterviewsService;
  let auditService: { log: jest.Mock };
  let prisma: {
    school: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    class: { findUnique: jest.Mock };
    studentParentLink: { findUnique: jest.Mock; findMany: jest.Mock };
    teacherClassAssignment: { findFirst: jest.Mock; findMany: jest.Mock };
    interviewEvent: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    interviewSlot: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      createMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const parentActor = {
    id: 'parent-1',
    role: UserRole.PARENT,
    memberships: [{ schoolId: 'school-1', isActive: true }],
  } as const;

  beforeEach(() => {
    prisma = {
      school: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      class: { findUnique: jest.fn() },
      studentParentLink: { findUnique: jest.fn(), findMany: jest.fn() },
      teacherClassAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
      interviewEvent: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      interviewSlot: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(prisma);
        }

        return Promise.all(arg as Promise<unknown>[]);
      }),
    };

    auditService = {
      log: jest.fn(),
    };

    service = new InterviewsService(prisma as never, auditService as never);
  });

  function mockParentLink(studentId = 'student-1') {
    prisma.studentParentLink.findUnique.mockResolvedValue({
      student: {
        id: studentId,
        role: UserRole.STUDENT,
        schoolId: 'school-1',
        memberships: [{ schoolId: 'school-1', isActive: true }],
      },
    });
  }

  it('rejects booking for unrelated student', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue(null);

    await expect(
      service.bookSlot(parentActor as never, 'slot-1', {
        studentId: 'student-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks double-booking when atomic slot update fails', async () => {
    mockParentLink();

    prisma.interviewSlot.findUnique.mockResolvedValue({
      id: 'slot-1',
      interviewEventId: 'event-1',
      schoolId: 'school-1',
      teacherId: 'teacher-1',
      classId: null,
      startTime: new Date('2099-01-10T10:00:00.000Z'),
      endTime: new Date('2099-01-10T10:15:00.000Z'),
      status: 'AVAILABLE',
      bookedParentId: null,
      bookedStudentId: null,
      interviewEvent: {
        id: 'event-1',
        startsAt: new Date('2099-01-01T00:00:00.000Z'),
        endsAt: new Date('2099-01-31T23:59:59.000Z'),
        bookingOpensAt: null,
        bookingClosesAt: null,
        isPublished: true,
        isActive: true,
      },
    });

    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
    prisma.interviewSlot.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.interviewSlot.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.bookSlot(parentActor as never, 'slot-1', {
        studentId: 'student-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes teacher slot list to the authenticated teacher only', async () => {
    prisma.interviewSlot.findMany.mockResolvedValue([]);

    await service.listTeacherSlots(
      {
        id: 'teacher-1',
        role: UserRole.TEACHER,
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      {},
    );

    expect(prisma.interviewSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teacherId: 'teacher-1',
        }),
      }),
    );
  });

  it('enforces admin school scope in slot listing', async () => {
    await expect(
      service.listSlots(
        {
          id: 'staff-1',
          role: UserRole.STAFF,
          memberships: [{ schoolId: 'school-1', isActive: true }],
        } as never,
        {
          schoolId: 'school-2',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.interviewSlot.findMany).not.toHaveBeenCalled();
  });

  it('blocks booking before the booking window opens', async () => {
    mockParentLink();

    const now = Date.now();
    prisma.interviewSlot.findUnique.mockResolvedValue({
      id: 'slot-1',
      interviewEventId: 'event-1',
      schoolId: 'school-1',
      teacherId: 'teacher-1',
      classId: null,
      startTime: new Date(now + 5 * 24 * 60 * 60 * 1000),
      endTime: new Date(now + 5 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000),
      status: 'AVAILABLE',
      bookedParentId: null,
      bookedStudentId: null,
      interviewEvent: {
        id: 'event-1',
        startsAt: new Date(now + 2 * 24 * 60 * 60 * 1000),
        endsAt: new Date(now + 9 * 24 * 60 * 60 * 1000),
        bookingOpensAt: new Date(now + 24 * 60 * 60 * 1000),
        bookingClosesAt: null,
        isPublished: true,
        isActive: true,
      },
    });

    await expect(
      service.bookSlot(parentActor as never, 'slot-1', {
        studentId: 'student-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks booking for past slots', async () => {
    mockParentLink();

    const now = Date.now();
    prisma.interviewSlot.findUnique.mockResolvedValue({
      id: 'slot-1',
      interviewEventId: 'event-1',
      schoolId: 'school-1',
      teacherId: 'teacher-1',
      classId: null,
      startTime: new Date(now - 10 * 60 * 1000),
      endTime: new Date(now + 5 * 60 * 1000),
      status: 'AVAILABLE',
      bookedParentId: null,
      bookedStudentId: null,
      interviewEvent: {
        id: 'event-1',
        startsAt: new Date(now - 24 * 60 * 60 * 1000),
        endsAt: new Date(now + 24 * 60 * 60 * 1000),
        bookingOpensAt: null,
        bookingClosesAt: null,
        isPublished: true,
        isActive: true,
      },
    });

    await expect(
      service.bookSlot(parentActor as never, 'slot-1', {
        studentId: 'student-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows admin to book for linked parent/student and records audit metadata', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue({
      parent: {
        id: 'parent-1',
        role: UserRole.PARENT,
        schoolId: 'school-1',
        memberships: [{ schoolId: 'school-1', isActive: true }],
      },
      student: {
        id: 'student-1',
        role: UserRole.STUDENT,
        schoolId: 'school-1',
        memberships: [{ schoolId: 'school-1', isActive: true }],
      },
    });

    prisma.interviewSlot.findUnique.mockResolvedValue({
      id: 'slot-1',
      interviewEventId: 'event-1',
      schoolId: 'school-1',
      teacherId: 'teacher-1',
      classId: null,
      startTime: new Date('2099-01-10T10:00:00.000Z'),
      endTime: new Date('2099-01-10T10:15:00.000Z'),
      status: 'AVAILABLE',
      bookedParentId: null,
      bookedStudentId: null,
      interviewEvent: {
        id: 'event-1',
        startsAt: new Date('2099-01-01T00:00:00.000Z'),
        endsAt: new Date('2099-01-31T23:59:59.000Z'),
        bookingOpensAt: null,
        bookingClosesAt: null,
        isPublished: true,
        isActive: true,
      },
    });

    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
    prisma.interviewSlot.findFirst.mockResolvedValue(null);
    prisma.interviewSlot.updateMany.mockResolvedValue({ count: 1 });
    prisma.interviewSlot.findUniqueOrThrow.mockResolvedValue({
      id: 'slot-1',
      interviewEventId: 'event-1',
      schoolId: 'school-1',
      teacherId: 'teacher-1',
      classId: null,
      startTime: new Date('2099-01-10T10:00:00.000Z'),
      endTime: new Date('2099-01-10T10:15:00.000Z'),
      location: null,
      meetingMode: null,
      notes: null,
      status: 'BOOKED',
      bookedParentId: 'parent-1',
      bookedStudentId: 'student-1',
      bookedAt: new Date('2099-01-01T00:00:00.000Z'),
      bookingNotes: null,
      createdAt: new Date('2099-01-01T00:00:00.000Z'),
      updatedAt: new Date('2099-01-01T00:00:00.000Z'),
      interviewEvent: {
        id: 'event-1',
        title: 'Fall Interviews',
        bookingOpensAt: null,
        bookingClosesAt: null,
        startsAt: new Date('2099-01-01T00:00:00.000Z'),
        endsAt: new Date('2099-01-31T23:59:59.000Z'),
        isPublished: true,
        isActive: true,
      },
      teacher: {
        id: 'teacher-1',
        firstName: 'T',
        lastName: 'One',
        email: null,
        username: 'teacher1',
        role: UserRole.TEACHER,
      },
      class: null,
      bookedParent: {
        id: 'parent-1',
        firstName: 'Parent',
        lastName: 'One',
        email: null,
        username: 'parent1',
      },
      bookedStudent: {
        id: 'student-1',
        firstName: 'Student',
        lastName: 'One',
        email: null,
        username: 'student1',
      },
    });

    const result = await service.bookSlotByAdmin(
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      'slot-1',
      {
        studentId: 'student-1',
        parentId: 'parent-1',
      },
    );

    expect(result.id).toBe('slot-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_BOOK_FOR_PARENT',
        metadataJson: expect.objectContaining({
          slotId: 'slot-1',
          studentId: 'student-1',
          parentId: 'parent-1',
        }),
      }),
    );
  });
});
