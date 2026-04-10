import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthenticatedUser) {
    const accessibleSchoolIds = getAccessibleSchoolIds(user);

    return this.prisma.school.findMany({
      where: isBypassRole(user.role)
        ? undefined
        : {
            id: {
              in: accessibleSchoolIds,
            },
          },
      orderBy: { createdAt: 'desc' },
    });
  }
}
