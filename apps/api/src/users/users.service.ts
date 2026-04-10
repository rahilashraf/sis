import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { safeUserSelect } from '../common/prisma/safe-user-response';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthenticatedUser) {
    const accessibleSchoolIds = getAccessibleSchoolIds(user);

    return this.prisma.user.findMany({
      where: isBypassRole(user.role)
        ? undefined
        : {
            memberships: {
              some: {
                schoolId: {
                  in: accessibleSchoolIds,
                },
                isActive: true,
              },
            },
          },
      orderBy: { createdAt: 'desc' },
      select: safeUserSelect,
    });
  }

  async create(user: AuthenticatedUser, data: CreateUserDto) {
    const { schoolId, password, ...userData } = data;

    if (!schoolId && !isBypassRole(user.role)) {
      throw new BadRequestException(
        'schoolId is required for school-scoped user creation',
      );
    }

    if (schoolId) {
      ensureUserHasSchoolAccess(user, schoolId);

      const school = await this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true },
      });

      if (!school) {
        throw new NotFoundException('School not found');
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.user.create({
      data: {
        ...userData,
        passwordHash,
        memberships: schoolId
          ? {
              create: {
                schoolId,
              },
            }
          : undefined,
      },
      select: safeUserSelect,
    });
  }
}
