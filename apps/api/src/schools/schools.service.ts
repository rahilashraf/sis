import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.school.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
