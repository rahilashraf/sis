import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    school: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      school: {
        findUnique: jest.fn(),
      },
    };

    service = new UsersService(prisma as never);
  });

  it('scopes list queries for admins to their active schools', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.findAll({
      id: 'admin-1',
      role: UserRole.ADMIN,
      memberships: [{ schoolId: 'school-1', isActive: true }],
    } as never);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          memberships: {
            some: {
              schoolId: {
                in: ['school-1'],
              },
              isActive: true,
            },
          },
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
});
