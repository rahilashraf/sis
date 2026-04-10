import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SchoolYearsService } from './school-years.service';

describe('SchoolYearsService', () => {
  let service: SchoolYearsService;
  let prisma: {
    schoolYear: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      schoolYear: {
        findMany: jest.fn(),
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
});
