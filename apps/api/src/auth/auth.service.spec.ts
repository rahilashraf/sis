jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
    };
  };
  let jwtService: {
    signAsync: jest.Mock;
  };
  let auditService: {
    logCritical: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
    };
    auditService = {
      logCritical: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      prisma as never,
      jwtService as never,
      auditService as never,
    );
  });

  it('returns a sanitized login response without passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'owner',
      passwordHash: 'hash',
      firstName: 'System',
      lastName: 'Owner',
      email: 'owner@example.com',
      role: 'OWNER',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      memberships: [],
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login('owner', 'secret');

    expect(result).toEqual({
      accessToken: 'signed-token',
      user: expect.objectContaining({
        id: 'user-1',
        username: 'owner',
      }),
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('throws UnauthorizedException when credentials are invalid', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'owner',
      passwordHash: 'hash',
      role: 'OWNER',
      isActive: true,
      memberships: [],
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login('owner', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
