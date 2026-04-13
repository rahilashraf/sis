import { UserRole } from '@prisma/client';
import { SchoolsService } from './schools.service';

describe('SchoolsService', () => {
  let service: SchoolsService;
  let prisma: {
    school: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    schoolYear: {
      updateMany: jest.Mock;
    };
    class: {
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      school: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      schoolYear: {
        updateMany: jest.fn(),
      },
      class: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    service = new SchoolsService(prisma as never);
  });

  it('creates an active membership for admins when they create a school', async () => {
    prisma.school.create.mockResolvedValue({
      id: 'school-1',
      name: 'North School',
      shortName: 'NS',
      isActive: true,
    });

    await expect(
      service.create(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          memberships: [],
        } as never,
        {
          name: 'North School',
          shortName: 'NS',
        },
      ),
    ).resolves.toEqual({
      id: 'school-1',
      name: 'North School',
      shortName: 'NS',
      isActive: true,
    });

    expect(prisma.school.create).toHaveBeenCalledWith({
      data: {
        memberships: {
          create: {
            userId: 'admin-1',
            isActive: true,
          },
        },
        name: 'North School',
        shortName: 'NS',
      },
    });
  });

  it('archives schools that still have dependent records', async () => {
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
    ).resolves.toEqual({
      success: true,
      removalMode: 'archived',
      reason: 'School was archived because related memberships still exist',
    });

    expect(prisma.school.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
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
    ).resolves.toEqual({ success: true, removalMode: 'deleted' });

    expect(prisma.school.delete).toHaveBeenCalledWith({
      where: { id: 'school-1' },
    });
  });
});
