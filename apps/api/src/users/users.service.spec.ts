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
      update: jest.Mock;
      delete: jest.Mock;
    };
    userSchoolMembership: {
      updateMany: jest.Mock;
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
        update: jest.fn(),
        delete: jest.fn(),
      },
      userSchoolMembership: {
        updateMany: jest.fn(),
      },
      school: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
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
