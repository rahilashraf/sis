import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { SchoolYearsService } from './school-years.service';

describe('SchoolYearsService', () => {
  let service: SchoolYearsService;
  let prisma: {
    schoolYear: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    class: {
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
    logCritical: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      schoolYear: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      class: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg({
            schoolYear: {
              findUnique: prisma.schoolYear.findUnique,
              update: prisma.schoolYear.update,
              updateMany: jest.fn(),
              delete: prisma.schoolYear.delete,
            },
            class: {
              updateMany: prisma.class.updateMany,
            },
          });
        }

        return arg;
      }),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
      logCritical: jest.fn().mockResolvedValue(undefined),
    };

    service = new SchoolYearsService(
      prisma as never,
      auditService as unknown as AuditService,
    );
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

  it('archives school years with dependent records', async () => {
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
    ).resolves.toEqual({
      success: true,
      removalMode: 'archived',
      reason: 'School year was archived because related classes still exist',
    });

    expect(prisma.schoolYear.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
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
    ).resolves.toEqual({ success: true, removalMode: 'deleted' });

    expect(prisma.schoolYear.delete).toHaveBeenCalledWith({
      where: { id: 'year-1' },
    });
  });
});
