import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: {
            school: true,
          },
        },
      },
    });
  }

  async create(data: CreateUserDto) {
    const { schoolId, password, ...userData } = data;

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
      include: {
        memberships: {
          include: {
            school: true,
          },
        },
      },
    });
  }
}
