import { ConflictException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SchoolsService } from './schools.service';

describe('SchoolsService', () => {
  let service: SchoolsService;
  let prisma: {
    school: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      school: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    service = new SchoolsService(prisma as never);
  });

  it('blocks deleting schools that still have dependent records', async () => {
    prisma.school.findUnique.mockResolvedValue({
      id: 'school-1',
      _count: {
        memberships: 1,
        schoolYears: 0,
        classes: 0,
        attendanceSessions: 0,
        reportingPeriods: 0,
      },
    });

    await expect(
      service.remove(
        {
          id: 'owner-1',
          role: UserRole.OWNER,
          memberships: [],
        } as never,
        'school-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.school.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty school', async () => {
    prisma.school.findUnique.mockResolvedValue({
      id: 'school-1',
      _count: {
        memberships: 0,
        schoolYears: 0,
        classes: 0,
        attendanceSessions: 0,
        reportingPeriods: 0,
      },
    });
    prisma.school.delete.mockResolvedValue({ id: 'school-1' });

    await expect(
      service.remove(
        {
          id: 'owner-1',
          role: UserRole.OWNER,
          memberships: [],
        } as never,
        'school-1',
      ),
    ).resolves.toEqual({ success: true });

    expect(prisma.school.delete).toHaveBeenCalledWith({
      where: { id: 'school-1' },
    });
  });
});
