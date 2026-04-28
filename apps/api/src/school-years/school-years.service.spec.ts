import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { SchoolYearsService } from './school-years.service';

describe('SchoolYearsService', () => {
  let service: SchoolYearsService;
  let prisma: {
    schoolYear: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    gradeLevel: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    class: {
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    enrollmentHistory: {
      upsert: jest.Mock;
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
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      gradeLevel: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      class: {
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      enrollmentHistory: {
        upsert: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg({
            schoolYear: {
              findUnique: prisma.schoolYear.findUnique,
              create: prisma.schoolYear.create,
              update: prisma.schoolYear.update,
              updateMany: prisma.schoolYear.updateMany,
              delete: prisma.schoolYear.delete,
            },
            gradeLevel: {
              updateMany: prisma.gradeLevel.updateMany,
            },
            class: {
              create: prisma.class.create,
              updateMany: prisma.class.updateMany,
            },
            user: {
              updateMany: prisma.user.updateMany,
            },
            enrollmentHistory: {
              upsert: prisma.enrollmentHistory.upsert,
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

  it('ends school year and archives connected classes in one transaction', async () => {
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
    });
    prisma.class.updateMany.mockResolvedValue({ count: 3 });
    prisma.schoolYear.update.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      name: '2025-2026',
      isActive: false,
      school: {
        id: 'school-1',
        name: 'North School',
      },
    });

    const result = await service.archive(
      {
        id: 'owner-1',
        role: UserRole.OWNER,
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      'year-1',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.class.updateMany).toHaveBeenCalledWith({
      where: {
        schoolYearId: 'year-1',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
    expect(result.isActive).toBe(false);
  });

  it('active list excludes ended school years by default', async () => {
    prisma.schoolYear.findMany.mockResolvedValue([{ id: 'active-year' }]);

    await service.findAllForSchool(
      {
        id: 'staff-1',
        role: UserRole.STAFF,
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      'school-1',
      false,
    );

    expect(prisma.schoolYear.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: 'school-1',
          isActive: true,
        },
      }),
    );
  });

  it('includeInactive list keeps ended school years readable', async () => {
    prisma.schoolYear.findMany.mockResolvedValue([
      { id: 'active-year', isActive: true },
      { id: 'ended-year', isActive: false },
    ]);

    const rows = await service.findAllForSchool(
      {
        id: 'staff-1',
        role: UserRole.STAFF,
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      'school-1',
      true,
    );

    expect(prisma.schoolYear.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: 'school-1',
        },
      }),
    );
    expect(rows).toHaveLength(2);
  });

  it('automatically ends years past endDate+15 days and archives classes', async () => {
    prisma.schoolYear.findMany.mockResolvedValue([
      { id: 'year-1' },
      { id: 'year-2' },
    ]);
    prisma.schoolYear.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.class.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await service.autoEndExpiredSchoolYearsAndArchiveClasses(
      new Date('2026-04-28T00:00:00.000Z'),
    );

    expect(prisma.schoolYear.findMany).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(result.evaluatedSchoolYears).toBe(2);
    expect(result.endedSchoolYearCount).toBe(1);
    expect(result.archivedClassCount).toBe(3);
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

  it('builds a rollover preview with promotion, graduation, and class template counts', async () => {
    prisma.schoolYear.findUnique
      .mockResolvedValueOnce({
        id: 'source-year',
        schoolId: 'school-1',
        name: '2025-2026',
        startDate: new Date('2025-09-01T00:00:00.000Z'),
        endDate: new Date('2026-06-30T00:00:00.000Z'),
        isActive: true,
      })
      .mockResolvedValueOnce(null);
    prisma.gradeLevel.findMany.mockResolvedValue([
      { id: 'g1', name: 'Grade 1', sortOrder: 1, isActive: true },
      { id: 'g2', name: 'Grade 2', sortOrder: 2, isActive: true },
      { id: 'g3', name: 'Grade 3', sortOrder: 3, isActive: true },
    ]);
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        name: 'Math A',
        isActive: true,
        gradeLevelId: 'g1',
        subjectOptionId: null,
        subject: 'Math',
        isHomeroom: false,
        takesAttendance: true,
        gradebookWeightingMode: 'UNWEIGHTED',
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'student-1', gradeLevelId: 'g1' },
      { id: 'student-2', gradeLevelId: 'g3' },
      { id: 'student-3', gradeLevelId: null },
    ]);

    const preview = await service.previewRollover(
      {
        id: 'owner-1',
        role: UserRole.OWNER,
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      {
        schoolId: 'school-1',
        sourceSchoolYearId: 'source-year',
        targetSchoolYearName: '2026-2027',
        targetStartDate: '2026-09-01',
        targetEndDate: '2027-06-30',
        copyClassTemplates: true,
      },
    );

    expect(preview.summary.classTemplatesToCreate).toBe(1);
    expect(preview.summary.promotableStudents).toBe(1);
    expect(preview.summary.graduatingStudents).toBe(1);
    expect(preview.summary.studentsWithoutGradeLevel).toBe(1);
  });

  it('executes rollover and writes all selected transitions', async () => {
    prisma.schoolYear.findUnique
      .mockResolvedValueOnce({
        id: 'source-year',
        schoolId: 'school-1',
        name: '2025-2026',
        startDate: new Date('2025-09-01T00:00:00.000Z'),
        endDate: new Date('2026-06-30T00:00:00.000Z'),
        isActive: true,
      })
      .mockResolvedValueOnce(null);
    prisma.gradeLevel.findMany.mockResolvedValue([
      { id: 'g1', name: 'Grade 1', sortOrder: 1, isActive: true },
      { id: 'g2', name: 'Grade 2', sortOrder: 2, isActive: true },
      { id: 'g3', name: 'Grade 3', sortOrder: 3, isActive: true },
    ]);
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        name: 'Math A',
        isActive: true,
        gradeLevelId: 'g1',
        subjectOptionId: null,
        subject: 'Math',
        isHomeroom: false,
        takesAttendance: true,
        gradebookWeightingMode: 'UNWEIGHTED',
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'student-1', gradeLevelId: 'g1' },
      { id: 'student-2', gradeLevelId: 'g3' },
    ]);
    prisma.schoolYear.create.mockResolvedValue({
      id: 'target-year',
      name: '2026-2027',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2027-06-30T00:00:00.000Z'),
      isActive: false,
    });
    prisma.class.create.mockResolvedValue({ id: 'new-class-1' });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.class.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.executeRollover(
      {
        id: 'owner-1',
        role: UserRole.OWNER,
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      {
        schoolId: 'school-1',
        sourceSchoolYearId: 'source-year',
        targetSchoolYearName: '2026-2027',
        targetStartDate: '2026-09-01',
        targetEndDate: '2027-06-30',
        copyClassTemplates: true,
      },
    );

    expect(result.success).toBe(true);
    expect(prisma.schoolYear.create).toHaveBeenCalled();
    expect(prisma.class.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).toHaveBeenCalled();
    expect(prisma.enrollmentHistory.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.schoolYear.updateMany).toHaveBeenCalled();
  });
});
