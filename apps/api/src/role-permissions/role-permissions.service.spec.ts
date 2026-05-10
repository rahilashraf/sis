import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolePermissionsService } from './role-permissions.service';

describe('RolePermissionsService', () => {
  let service: RolePermissionsService;
  let prisma: {
    school: { findUnique: jest.Mock };
    user: { findMany: jest.Mock };
    rolePermissionSetting: { findMany: jest.Mock; upsert: jest.Mock; findUnique: jest.Mock };
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
      user: {
        findMany: jest.fn(),
      },
      rolePermissionSetting: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    service = new RolePermissionsService(prisma as never, auditService as never);
  });

  it('rejects attempts to mutate OWNER role permissions', async () => {
    await expect(
      service.updateRolePermissions({
        user: ownerUser as never,
        schoolId: 'school-1',
        role: UserRole.OWNER,
        body: {
          permissions: [{ resource: 'SCHOOLS', action: 'VIEW', allowed: false }],
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks changes that would lock all active privileged users from core settings', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'super-admin-1',
        role: UserRole.SUPER_ADMIN,
      },
    ]);

    prisma.rolePermissionSetting.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      service.updateRolePermissions({
        user: ownerUser as never,
        schoolId: 'school-1',
        role: UserRole.SUPER_ADMIN,
        body: {
          permissions: [
            { resource: 'SCHOOLS', action: 'VIEW', allowed: false },
            { resource: 'SCHOOLS', action: 'MANAGE', allowed: false },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
