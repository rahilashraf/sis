import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLinkDto } from './dto/create-link.dto';

@Injectable()
export class LinksService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateLinkDto) {
    return this.prisma.studentParentLink.create({
      data,
      include: {
        parent: true,
        student: true,
      },
    });
  }

  findByParent(parentId: string) {
    return this.prisma.studentParentLink.findMany({
      where: { parentId },
      include: {
        student: true,
      },
    });
  }

  findByStudent(studentId: string) {
    return this.prisma.studentParentLink.findMany({
      where: { studentId },
      include: {
        parent: true,
      },
    });
  }

  remove(id: string) {
    return this.prisma.studentParentLink.delete({
      where: { id },
    });
  }
}