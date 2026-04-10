import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolYearDto } from './dto/create-school-year.dto';

@Injectable()
export class SchoolYearsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildInclude() {
    return {
      school: true,
    };
  }

  private ensureValidDateRange(startDate: Date, endDate: Date) {
    if (startDate >= endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }
  }

  async create(data: CreateSchoolYearDto) {
    const school = await this.prisma.school.findUnique({
      where: { id: data.schoolId },
      select: { id: true },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    this.ensureValidDateRange(startDate, endDate);

    return this.prisma.schoolYear.create({
      data: {
        schoolId: data.schoolId,
        name: data.name,
        startDate,
        endDate,
      },
      include: this.buildInclude(),
    });
  }

  findAllForSchool(schoolId: string) {
    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    return this.prisma.schoolYear.findMany({
      where: {
        schoolId,
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: this.buildInclude(),
    });
  }

  async activate(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.schoolYear.findUnique({
        where: { id },
        select: {
          id: true,
          schoolId: true,
        },
      });

      if (!existing) {
        throw new NotFoundException('School year not found');
      }

      await tx.schoolYear.updateMany({
        where: {
          schoolId: existing.schoolId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      return tx.schoolYear.update({
        where: { id: existing.id },
        data: {
          isActive: true,
        },
        include: this.buildInclude(),
      });
    });
  }

  async archive(id: string) {
    const existing = await this.prisma.schoolYear.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('School year not found');
    }

    return this.prisma.schoolYear.update({
      where: { id },
      data: {
        isActive: false,
      },
      include: this.buildInclude(),
    });
  }
}
