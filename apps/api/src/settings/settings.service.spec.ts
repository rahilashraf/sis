import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const originalEnv = process.env;

  let service: SettingsService;
  let prisma: {
    systemSetting: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };

  const ownerUser = {
    id: 'owner-1',
    role: UserRole.OWNER,
    memberships: [],
  };

  const adminUser = {
    id: 'admin-1',
    role: UserRole.ADMIN,
    memberships: [],
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
    };

    prisma = {
      systemSetting: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    service = new SettingsService(prisma as never);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns current audit setting from database when present', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue({
      value: 'false',
    });

    await expect(service.getAuditSettings(ownerUser as never)).resolves.toEqual({
      enabled: false,
    });
  });

  it('falls back to env default when database setting does not exist', async () => {
    process.env.AUDIT_LOGS_ENABLED = 'true';
    prisma.systemSetting.findUnique.mockResolvedValue(null);

    await expect(service.getAuditSettings(ownerUser as never)).resolves.toEqual({
      enabled: true,
    });
  });

  it('updates audit setting through upsert', async () => {
    prisma.systemSetting.upsert.mockResolvedValue({});

    await expect(
      service.updateAuditSettings(ownerUser as never, false),
    ).resolves.toEqual({
      enabled: false,
    });

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: {
        key: 'AUDIT_LOGS_ENABLED',
      },
      create: {
        key: 'AUDIT_LOGS_ENABLED',
        value: 'false',
      },
      update: {
        value: 'false',
      },
    });
  });

  it('denies non-high-privilege users', async () => {
    await expect(
      service.getAuditSettings(adminUser as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.updateAuditSettings(adminUser as never, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
