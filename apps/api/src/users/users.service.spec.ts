import { BadRequestException, ConflictException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    userSchoolMembership: {
      updateMany: jest.Mock;
      upsert: jest.Mock;
    };
    school: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      userSchoolMembership: {
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      school: {
        findUnique: jest.fn(),
      },
    $transaction: jest.fn().mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return arg(prisma);
      }

      return arg;
    }),
    };

    service = new UsersService(prisma as never);
  });

  it('does not scope list queries for admins', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.findAll({
      id: 'admin-1',
      role: UserRole.ADMIN,
      memberships: [{ schoolId: 'school-1', isActive: true }],
    } as never);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
        },
      }),
    );
  });

  it('requires schoolId for non-bypass user creation', async () => {
    await expect(
      service.create(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          memberships: [{ schoolId: 'school-1', isActive: true }],
        } as never,
        {
          username: 'teacher-1',
          password: 'secret123',
          firstName: 'Ada',
          lastName: 'Lovelace',
          role: UserRole.TEACHER,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates school-scoped users with multiple memberships', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1' });
    prisma.user.create.mockResolvedValue({ id: 'teacher-1' });

    await service.create(
      {
        id: 'owner-1',
        role: UserRole.OWNER,
        memberships: [],
      } as never,
      {
        username: 'teacher-1',
        password: 'secret123',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: UserRole.TEACHER,
        schoolIds: ['school-1'],
      } as never,
    );

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          school: { connect: { id: 'school-1' } },
          memberships: {
            createMany: {
              data: [{ schoolId: 'school-1' }],
            },
          },
        }),
      }),
    );
  });

  it('supports legacy schoolId fallback when updating memberships', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'teacher-1',
      role: UserRole.TEACHER,
      schoolId: 'school-legacy',
      memberships: [],
    });
    prisma.school.findUnique.mockResolvedValue({ id: 'school-legacy' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'teacher-1',
      role: UserRole.TEACHER,
      schoolId: 'school-legacy',
      memberships: [{ schoolId: 'school-legacy', isActive: true }],
    });

    const result = await service.setMemberships(
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
        schoolId: 'school-legacy',
        memberships: [],
      } as never,
      'teacher-1',
      {
        schoolIds: ['school-legacy'],
        primarySchoolId: 'school-legacy',
      },
    );

    expect(result.schoolId).toBe('school-legacy');
    expect(prisma.userSchoolMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_schoolId: {
            userId: 'teacher-1',
            schoolId: 'school-legacy',
          },
        },
      }),
    );
  });

  it('blocks deleting the current user account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
      memberships: [],
      _count: {
        parentLinks: 0,
        studentLinks: 0,
        teacherClasses: 0,
        studentClasses: 0,
        takenAttendanceSessions: 0,
        attendanceRecords: 0,
        studentGradeRecords: 0,
      },
    });

    await expect(
      service.remove(
        {
          id: 'admin-1',
          role: UserRole.OWNER,
          memberships: [],
        } as never,
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('deactivates users with related records instead of blocking removal', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'teacher-1',
        role: UserRole.TEACHER,
        memberships: [],
        _count: {
          parentLinks: 0,
          studentLinks: 0,
          teacherClasses: 1,
          studentClasses: 0,
          takenAttendanceSessions: 0,
          attendanceRecords: 0,
          studentGradeRecords: 0,
        },
      })
      .mockResolvedValueOnce({
        id: 'teacher-1',
        role: UserRole.TEACHER,
        memberships: [],
      });

    await expect(
      service.remove(
        {
          id: 'owner-1',
          role: UserRole.OWNER,
          memberships: [],
        } as never,
        'teacher-1',
      ),
    ).resolves.toEqual({
      success: true,
      removalMode: 'deactivated',
      reason:
        'User was deactivated because related teacher assignments still exist',
    });

    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('deletes a manageable user with no dependent records', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'teacher-1',
        role: UserRole.TEACHER,
        memberships: [],
        _count: {
          parentLinks: 0,
          studentLinks: 0,
          teacherClasses: 0,
          studentClasses: 0,
          takenAttendanceSessions: 0,
          attendanceRecords: 0,
          studentGradeRecords: 0,
        },
      })
      .mockResolvedValueOnce({
        id: 'teacher-1',
        role: UserRole.TEACHER,
        memberships: [],
      });

    prisma.user.delete.mockResolvedValue({ id: 'teacher-1' });

    await expect(
      service.remove(
        {
          id: 'owner-1',
          role: UserRole.OWNER,
          memberships: [],
        } as never,
        'teacher-1',
      ),
    ).resolves.toEqual({ success: true, removalMode: 'deleted' });

    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'teacher-1' },
    });
  });
});
