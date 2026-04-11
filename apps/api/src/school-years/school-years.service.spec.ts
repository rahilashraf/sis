import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SchoolYearsService } from './school-years.service';

describe('SchoolYearsService', () => {
  let service: SchoolYearsService;
  let prisma: {
    schoolYear: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      schoolYear: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    service = new SchoolYearsService(prisma as never);
  });

  it('blocks listing school years outside the user school scope', async () => {
    expect(() =>
      service.findAllForSchool(
        {
          id: 'staff-1',
          role: UserRole.STAFF,
          memberships: [{ schoolId: 'school-1', isActive: true }],
        } as never,
        'school-2',
      ),
    ).toThrow(ForbiddenException);
  });

  it('blocks deleting school years with dependent records', async () => {
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      _count: {
        classes: 1,
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
        'year-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.schoolYear.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty school year', async () => {
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      _count: {
        classes: 0,
        attendanceSessions: 0,
        reportingPeriods: 0,
      },
    });
    prisma.schoolYear.delete.mockResolvedValue({ id: 'year-1' });

    await expect(
      service.remove(
        {
          id: 'owner-1',
          role: UserRole.OWNER,
          memberships: [],
        } as never,
        'year-1',
      ),
    ).resolves.toEqual({ success: true });

    expect(prisma.schoolYear.delete).toHaveBeenCalledWith({
      where: { id: 'year-1' },
    });
  });
});
