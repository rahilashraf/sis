import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { GradeScalesService } from './grade-scales.service';

describe('GradeScalesService', () => {
  let service: GradeScalesService;
  let prisma: {
    school: { findUnique: jest.Mock; findMany: jest.Mock };
    gradeScale: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    gradeScaleRule: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      createMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const ownerUser = {
    id: 'owner-1',
    role: UserRole.OWNER,
    memberships: [],
  } as never;

  beforeEach(() => {
    prisma = {
      school: { findUnique: jest.fn(), findMany: jest.fn() },
      gradeScale: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      gradeScaleRule: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: any) => any) => fn(prisma)),
    };

    service = new GradeScalesService(prisma as never);
  });

  it('rejects non-owner/super-admin access', async () => {
    await expect(
      service.list(
        { id: 'teacher-1', role: UserRole.TEACHER, memberships: [] } as never,
        'school-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents overlapping grade scale rules', async () => {
    prisma.gradeScale.findUnique.mockResolvedValue({
      id: 'scale-1',
      schoolId: 'school-1',
      isActive: true,
    });

    prisma.gradeScaleRule.findMany.mockResolvedValue([
      { id: 'rule-1', minPercent: 80, maxPercent: 89.999 },
    ]);

    await expect(
      service.addRule(ownerUser, 'scale-1', {
        minPercent: 85,
        maxPercent: 95,
        letterGrade: 'A',
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('applies a grade scale across schools and skips duplicates', async () => {
    prisma.school.findMany.mockResolvedValue([
      { id: 'school-1', name: 'School One' },
      { id: 'school-2', name: 'School Two' },
    ]);
    prisma.gradeScale.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'existing-scale',
    });
    prisma.gradeScale.create.mockResolvedValue({
      id: 'new-scale-1',
      schoolId: 'school-1',
      name: 'Default Scale',
      isDefault: false,
      isActive: true,
    });

    const response = await service.applyAcrossSchools(ownerUser, {
      targetSchoolIds: ['school-1', 'school-2'],
      name: 'Default Scale',
      copyRules: false,
    });

    expect(response.createdCount).toBe(1);
    expect(response.skippedCount).toBe(1);
    expect(response.failedCount).toBe(0);
    expect(response.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schoolId: 'school-1',
          status: 'created',
        }),
        expect.objectContaining({
          schoolId: 'school-2',
          status: 'skipped',
        }),
      ]),
    );
  });
});
