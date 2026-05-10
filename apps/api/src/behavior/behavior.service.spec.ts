import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FeatureTogglesService } from '../feature-toggles/feature-toggles.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import { BehaviorService } from './behavior.service';

describe('BehaviorService upload security', () => {
  let service: BehaviorService;
  let prisma: {
    behaviorRecord: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      behaviorRecord: {
        findUnique: jest.fn(),
      },
    };

    service = new BehaviorService(prisma as never, {
      log: jest.fn().mockResolvedValue(undefined),
    } as never, {
      assertFeatureEnabledForSchool: jest.fn().mockResolvedValue(undefined),
    } as unknown as FeatureTogglesService, {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
      getDeniedSchoolIdsForPermission: jest.fn().mockResolvedValue([]),
    } as unknown as RolePermissionsService);
  });

  it('rejects files that are labeled PDF but do not contain a PDF signature', async () => {
    prisma.behaviorRecord.findUnique.mockResolvedValue({
      id: 'record-1',
      studentId: 'student-1',
      schoolId: 'school-1',
    });

    await expect(
      service.uploadAttachment(
        {
          id: 'teacher-1',
          role: UserRole.TEACHER,
          memberships: [{ schoolId: 'school-1' }],
        },
        'record-1',
        {
          originalname: 'notes.pdf',
          mimetype: 'application/pdf',
          size: 128,
          buffer: Buffer.from('not a real pdf'),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
