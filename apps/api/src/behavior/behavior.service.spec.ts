import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
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
    } as never);
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
