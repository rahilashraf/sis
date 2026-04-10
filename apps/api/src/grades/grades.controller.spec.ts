import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-test-user-id'];
    const role = request.headers['x-test-role'];

    request.user = {
      id: Array.isArray(userId) ? userId[0] : userId,
      role: Array.isArray(role) ? role[0] : role,
    };

    return true;
  }
}

@Injectable()
class TestRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    return requiredRoles.includes(request.user?.role);
  }
}

describe('GradesController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    class: { findUnique: jest.Mock };
    reportingPeriod: { findFirst: jest.Mock };
    teacherClassAssignment: { findFirst: jest.Mock };
    studentClassEnrollment: { findFirst: jest.Mock };
    studentParentLink: { findUnique: jest.Mock };
    gradeRecord: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      class: { findUnique: jest.fn() },
      reportingPeriod: { findFirst: jest.fn() },
      teacherClassAssignment: { findFirst: jest.fn() },
      studentClassEnrollment: { findFirst: jest.fn() },
      studentParentLink: { findUnique: jest.fn() },
      gradeRecord: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [GradesController],
      providers: [
        GradesService,
        Reflector,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useClass(TestRolesGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a grade record for admin-like access', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    prisma.reportingPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      isLocked: false,
    });
    prisma.gradeRecord.create.mockResolvedValue({
      id: 'grade-1',
      title: 'Quiz 1',
      score: 8,
      maxScore: 10,
      class: { id: 'class-1', schoolYear: { id: 'year-1' } },
      student: { id: 'student-1', firstName: 'Ada' },
    });

    await request(app.getHttpServer())
      .post('/grades')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        classId: 'class-1',
        studentId: 'student-1',
        title: 'Quiz 1',
        score: 8,
        maxScore: 10,
        gradedAt: '2026-04-10T00:00:00.000Z',
      })
      .expect(201)
      .expect({
        id: 'grade-1',
        title: 'Quiz 1',
        score: 8,
        maxScore: 10,
        class: { id: 'class-1', schoolYear: { id: 'year-1' } },
        student: { id: 'student-1', firstName: 'Ada' },
      });

    expect(prisma.gradeRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classId: 'class-1',
          studentId: 'student-1',
          title: 'Quiz 1',
          score: 8,
          maxScore: 10,
          gradedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('creates a grade record for a teacher in an unlocked reporting period', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    prisma.reportingPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      isLocked: false,
    });
    prisma.gradeRecord.create.mockResolvedValue({
      id: 'grade-1',
      title: 'Quiz 1',
      score: 8,
      maxScore: 10,
    });

    await request(app.getHttpServer())
      .post('/grades')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        classId: 'class-1',
        studentId: 'student-1',
        title: 'Quiz 1',
        score: 8,
        maxScore: 10,
        gradedAt: '2026-04-10T00:00:00.000Z',
      })
      .expect(201)
      .expect({
        id: 'grade-1',
        title: 'Quiz 1',
        score: 8,
        maxScore: 10,
      });

    expect(prisma.teacherClassAssignment.findFirst).toHaveBeenCalled();
    expect(prisma.reportingPeriod.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: 'school-1',
          schoolYearId: 'year-1',
        }),
      }),
    );
  });

  it('returns 403 when a student attempts to create a grade record', async () => {
    await request(app.getHttpServer())
      .post('/grades')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .send({
        classId: 'class-1',
        studentId: 'student-1',
        title: 'Quiz 1',
        score: 8,
        maxScore: 10,
        gradedAt: '2026-04-10T00:00:00.000Z',
      })
      .expect(403);

    expect(prisma.gradeRecord.create).not.toHaveBeenCalled();
  });

  it('returns 403 when a teacher creates a grade record for an unassigned class', async () => {
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/grades')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        classId: 'class-1',
        studentId: 'student-1',
        title: 'Quiz 1',
        score: 8,
        maxScore: 10,
        gradedAt: '2026-04-10T00:00:00.000Z',
      })
      .expect(403);

    expect(prisma.studentClassEnrollment.findFirst).not.toHaveBeenCalled();
    expect(prisma.reportingPeriod.findFirst).not.toHaveBeenCalled();
    expect(prisma.gradeRecord.create).not.toHaveBeenCalled();
  });

  it('returns 403 when a teacher creates a grade record in a locked reporting period', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    prisma.reportingPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      isLocked: true,
    });

    await request(app.getHttpServer())
      .post('/grades')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        classId: 'class-1',
        studentId: 'student-1',
        title: 'Quiz 1',
        score: 8,
        maxScore: 10,
        gradedAt: '2026-04-10T00:00:00.000Z',
      })
      .expect(403);

    expect(prisma.gradeRecord.create).not.toHaveBeenCalled();
  });

  it('returns 400 when gradedAt does not fall within a reporting period', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    prisma.reportingPeriod.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/grades')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        classId: 'class-1',
        studentId: 'student-1',
        title: 'Quiz 1',
        score: 8,
        maxScore: 10,
        gradedAt: '2026-08-10T00:00:00.000Z',
      })
      .expect(400);

    expect(prisma.gradeRecord.create).not.toHaveBeenCalled();
  });

  it('returns 400 when score exceeds maxScore', async () => {
    await request(app.getHttpServer())
      .post('/grades')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        classId: 'class-1',
        studentId: 'student-1',
        title: 'Quiz 1',
        score: 11,
        maxScore: 10,
        gradedAt: '2026-04-10T00:00:00.000Z',
      })
      .expect(400);

    expect(prisma.class.findUnique).not.toHaveBeenCalled();
  });

  it('returns 400 when maxScore is zero', async () => {
    await request(app.getHttpServer())
      .post('/grades')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        classId: 'class-1',
        studentId: 'student-1',
        title: 'Quiz 1',
        score: 0,
        maxScore: 0,
        gradedAt: '2026-04-10T00:00:00.000Z',
      })
      .expect(400);

    expect(prisma.class.findUnique).not.toHaveBeenCalled();
  });

  it('allows an admin to update a grade record in a locked reporting period', async () => {
    prisma.gradeRecord.findUnique.mockResolvedValue({
      id: 'grade-1',
      classId: 'class-1',
      score: 8,
      maxScore: 10,
      gradedAt: new Date('2026-04-10T00:00:00.000Z'),
    });
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.reportingPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      isLocked: true,
    });
    prisma.gradeRecord.update.mockResolvedValue({
      id: 'grade-1',
      title: 'Updated Quiz 1',
      score: 8,
      maxScore: 10,
    });

    await request(app.getHttpServer())
      .patch('/grades/grade-1')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        title: 'Updated Quiz 1',
      })
      .expect(200)
      .expect({
        id: 'grade-1',
        title: 'Updated Quiz 1',
        score: 8,
        maxScore: 10,
      });

    expect(prisma.gradeRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'grade-1' },
        data: { title: 'Updated Quiz 1' },
      }),
    );
  });

  it('returns 403 when a teacher updates a grade record from a locked reporting period', async () => {
    prisma.gradeRecord.findUnique.mockResolvedValue({
      id: 'grade-1',
      classId: 'class-1',
      score: 8,
      maxScore: 10,
      gradedAt: new Date('2026-04-10T00:00:00.000Z'),
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.reportingPeriod.findFirst.mockResolvedValueOnce({
      id: 'period-1',
      isLocked: true,
    });

    await request(app.getHttpServer())
      .patch('/grades/grade-1')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        gradedAt: '2026-02-10T00:00:00.000Z',
        title: 'Updated Quiz 1',
      })
      .expect(403);

    expect(prisma.gradeRecord.update).not.toHaveBeenCalled();
    expect(prisma.reportingPeriod.findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when a teacher updates gradedAt into a locked reporting period', async () => {
    prisma.gradeRecord.findUnique.mockResolvedValue({
      id: 'grade-1',
      classId: 'class-1',
      score: 8,
      maxScore: 10,
      gradedAt: new Date('2026-02-10T00:00:00.000Z'),
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.reportingPeriod.findFirst
      .mockResolvedValueOnce({
        id: 'period-1',
        isLocked: false,
      })
      .mockResolvedValueOnce({
        id: 'period-2',
        isLocked: true,
      });

    await request(app.getHttpServer())
      .patch('/grades/grade-1')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        gradedAt: '2026-04-10T00:00:00.000Z',
      })
      .expect(403);

    expect(prisma.gradeRecord.update).not.toHaveBeenCalled();
    expect(prisma.reportingPeriod.findFirst).toHaveBeenCalledTimes(2);
  });

  it('returns class grades for an assigned teacher', async () => {
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
    prisma.gradeRecord.findMany.mockResolvedValue([
      {
        id: 'grade-1',
        title: 'Quiz 1',
        student: { id: 'student-1', firstName: 'Ada' },
      },
    ]);

    await request(app.getHttpServer())
      .get('/grades/classes/class-1')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect([
        {
          id: 'grade-1',
          title: 'Quiz 1',
          student: { id: 'student-1', firstName: 'Ada' },
        },
      ]);
  });

  it('returns 403 when a parent requests class grades', async () => {
    await request(app.getHttpServer())
      .get('/grades/classes/class-1')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .expect(403);

    expect(prisma.gradeRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns student grades for self access', async () => {
    prisma.gradeRecord.findMany.mockResolvedValue([
      {
        id: 'grade-1',
        title: 'Quiz 1',
        class: { id: 'class-1', name: 'Math' },
      },
    ]);

    await request(app.getHttpServer())
      .get('/grades/students/student-1')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .expect(200)
      .expect([
        {
          id: 'grade-1',
          title: 'Quiz 1',
          class: { id: 'class-1', name: 'Math' },
        },
      ]);
  });

  it('returns 403 when a student requests another student grades', async () => {
    await request(app.getHttpServer())
      .get('/grades/students/student-2')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .expect(403);

    expect(prisma.gradeRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns student grades for a linked parent', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue({ id: 'link-1' });
    prisma.gradeRecord.findMany.mockResolvedValue([
      {
        id: 'grade-1',
        title: 'Quiz 1',
        class: { id: 'class-1', name: 'Math' },
      },
    ]);

    await request(app.getHttpServer())
      .get('/grades/students/student-1')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .expect(200)
      .expect([
        {
          id: 'grade-1',
          title: 'Quiz 1',
          class: { id: 'class-1', name: 'Math' },
        },
      ]);
  });

  it('returns teacher-filtered student grades for an assigned teacher', async () => {
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    prisma.gradeRecord.findMany.mockResolvedValue([
      {
        id: 'grade-1',
        title: 'Quiz 1',
        class: { id: 'class-1', name: 'Math' },
      },
    ]);

    await request(app.getHttpServer())
      .get('/grades/students/student-1')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect([
        {
          id: 'grade-1',
          title: 'Quiz 1',
          class: { id: 'class-1', name: 'Math' },
        },
      ]);

    expect(prisma.gradeRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: 'student-1',
          class: {
            teachers: {
              some: {
                teacherId: 'teacher-1',
              },
            },
          },
        },
      }),
    );
  });
});
