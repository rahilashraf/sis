import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ClassesService } from './classes.service';

describe('ClassesService', () => {
  let service: ClassesService;
  let prisma: {
    class: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    teacherClassAssignment: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      class: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      teacherClassAssignment: {
        create: jest.fn(),
      },
    };

    service = new ClassesService(prisma as never);
  });

  it('scopes class listing for staff to their active schools', async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await service.findAll({
      id: 'staff-1',
      role: UserRole.STAFF,
      memberships: [{ schoolId: 'school-1', isActive: true }],
    } as never);

    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: {
            in: ['school-1'],
          },
        },
      }),
    );
  });

  it('rejects assigning a teacher from another school', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'teacher-1',
        role: UserRole.TEACHER,
        memberships: [{ schoolId: 'school-2' }],
      })
      .mockResolvedValueOnce({
        id: 'teacher-1',
        role: UserRole.TEACHER,
      });

    await expect(
      service.assignTeacher(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          memberships: [{ schoolId: 'school-1', isActive: true }],
        } as never,
        'class-1',
        { teacherId: 'teacher-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
