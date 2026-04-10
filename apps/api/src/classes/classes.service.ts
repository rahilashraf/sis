import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { AssignTeacherDto } from './dto/assign-teacher.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateClassDto) {
    return this.prisma.class.create({
      data: {
        schoolId: data.schoolId,
        schoolYearId: data.schoolYearId,
        name: data.name,
        subject: data.subject,
        isHomeroom: data.isHomeroom ?? false,
      },
      include: {
        school: true,
        schoolYear: true,
        teachers: {
          include: {
            teacher: true,
          },
        },
        students: {
          include: {
            student: true,
          },
        },
      },
    });
  }

  findAll() {
    return this.prisma.class.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        school: true,
        schoolYear: true,
        teachers: {
          include: {
            teacher: true,
          },
        },
        students: {
          include: {
            student: true,
          },
        },
      },
    });
  }

  async findMyClasses(user: any) {
    if (['OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(user.role)) {
      return this.prisma.class.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: {
          school: true,
          schoolYear: true,
          teachers: {
            include: {
              teacher: true,
            },
          },
        },
      });
    }

    if (!['TEACHER', 'SUPPLY_TEACHER'].includes(user.role)) {
      throw new ForbiddenException('You do not have class access');
    }

    const assignments = await this.prisma.teacherClassAssignment.findMany({
      where: { teacherId: user.id },
      include: {
        class: {
          include: {
            school: true,
            schoolYear: true,
            teachers: {
              include: {
                teacher: true,
              },
            },
          },
        },
      },
      orderBy: {
        class: {
          name: 'asc',
        },
      },
    });

    return assignments.map((assignment) => assignment.class);
  }

  assignTeacher(classId: string, data: AssignTeacherDto) {
    return this.prisma.teacherClassAssignment.create({
      data: {
        classId,
        teacherId: data.teacherId,
      },
      include: {
        teacher: true,
        class: true,
      },
    });
  }

  enrollStudent(classId: string, data: EnrollStudentDto) {
    return this.prisma.studentClassEnrollment.create({
      data: {
        classId,
        studentId: data.studentId,
      },
      include: {
        student: true,
        class: true,
      },
    });
  }

  findTeachers(classId: string) {
    return this.prisma.teacherClassAssignment.findMany({
      where: { classId },
      include: {
        teacher: true,
      },
    });
  }

  findStudents(classId: string) {
    return this.prisma.studentClassEnrollment.findMany({
      where: { classId },
      include: {
        student: true,
      },
    });
  }

  findClassesForTeacher(teacherId: string) {
    return this.prisma.teacherClassAssignment.findMany({
      where: { teacherId },
      include: {
        class: {
          include: {
            school: true,
            schoolYear: true,
          },
        },
      },
    });
  }

  findClassesForStudent(studentId: string) {
    return this.prisma.studentClassEnrollment.findMany({
      where: { studentId },
      include: {
        class: {
          include: {
            school: true,
            schoolYear: true,
          },
        },
      },
    });
  }
}