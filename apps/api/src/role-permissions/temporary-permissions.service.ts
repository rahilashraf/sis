import { Injectable } from '@nestjs/common';
import type { PermissionAction, PermissionResource, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TemporaryPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveGrants(options: {
    schoolId: string;
    role: UserRole;
    userId: string;
    at?: Date;
  }) {
    const at = options.at ?? new Date();

    return this.prisma.temporaryPermissionGrant.findMany({
      where: {
        schoolId: options.schoolId,
        startsAt: { lte: at },
        endsAt: { gte: at },
        OR: [{ userId: options.userId }, { role: options.role }],
      },
      select: {
        id: true,
        role: true,
        userId: true,
        resource: true,
        action: true,
        allowed: true,
        startsAt: true,
        endsAt: true,
        reason: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async resolveGrantOverride(options: {
    schoolId: string;
    role: UserRole;
    userId: string;
    resource: PermissionResource;
    action: PermissionAction;
    at?: Date;
  }) {
    const at = options.at ?? new Date();

    const grants = await this.prisma.temporaryPermissionGrant.findMany({
      where: {
        schoolId: options.schoolId,
        resource: options.resource,
        action: options.action,
        startsAt: { lte: at },
        endsAt: { gte: at },
        OR: [{ userId: options.userId }, { role: options.role }],
      },
      select: {
        userId: true,
        allowed: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 5,
    });

    if (grants.length === 0) {
      return null;
    }

    const userSpecific = grants.find((entry) => entry.userId === options.userId);
    if (userSpecific) {
      return userSpecific.allowed;
    }

    return grants[0].allowed;
  }
}
