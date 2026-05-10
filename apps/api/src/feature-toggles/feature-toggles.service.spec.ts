import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FeatureTogglesService } from './feature-toggles.service';

describe('FeatureTogglesService', () => {
  let service: FeatureTogglesService;
  let prisma: {
    school: { findUnique: jest.Mock };
    schoolFeatureToggle: { findMany: jest.Mock; upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };

  const ownerUser = {
    id: 'owner-1',
    role: UserRole.OWNER,
    memberships: [],
  };

  beforeEach(() => {
    prisma = {
      school: {
        findUnique: jest.fn().mockResolvedValue({ id: 'school-1' }),
      },
      schoolFeatureToggle: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    service = new FeatureTogglesService(prisma as never, auditService as never);
  });

  it('blocks updates that would disable all modules', async () => {
    await expect(
      service.updateSchoolFeatureToggles(ownerUser as never, 'school-1', {
        INCIDENT_REPORTS: false,
        ATTENDANCE: false,
        GRADEBOOK: false,
        FORMS: false,
        RE_REGISTRATION: false,
        BILLING: false,
        LIBRARY: false,
        UNIFORM_ORDERS: false,
        NOTIFICATIONS: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('audit logs feature toggle updates with before/after values', async () => {
    prisma.schoolFeatureToggle.findMany
      .mockResolvedValueOnce([
        { module: 'ATTENDANCE', enabled: true },
        { module: 'GRADEBOOK', enabled: true },
      ])
      .mockResolvedValueOnce([
        { module: 'ATTENDANCE', enabled: false },
        { module: 'GRADEBOOK', enabled: true },
      ]);

    prisma.schoolFeatureToggle.upsert.mockResolvedValue(undefined);

    await expect(
      service.updateSchoolFeatureToggles(ownerUser as never, 'school-1', {
        ATTENDANCE: false,
      }),
    ).resolves.toMatchObject({
      schoolId: 'school-1',
      features: expect.objectContaining({ ATTENDANCE: false }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'SchoolFeatureToggle',
        action: 'BULK_UPDATE',
        schoolId: 'school-1',
      }),
    );
  });
});
