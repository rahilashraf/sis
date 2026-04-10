import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  findMyStudents(parentId: string) {
    return this.prisma.studentParentLink.findMany({
      where: { parentId },
      include: {
        student: {
          include: {
            memberships: {
              include: {
                school: true,
              },
            },
          },
        },
      },
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
      ],
    });
  }
}
