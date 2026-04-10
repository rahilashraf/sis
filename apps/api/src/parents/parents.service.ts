import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { safeUserSelect } from '../common/prisma/safe-user-response';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  findMyStudents(parentId: string) {
    return this.prisma.studentParentLink.findMany({
      where: { parentId },
      select: {
        id: true,
        parentId: true,
        studentId: true,
        createdAt: true,
        student: {
          select: safeUserSelect,
        },
      },
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
      ],
    });
  }
}
