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
    teacherClassAssignment: { findFirst: jest.Mock };
    studentClassEnrollment: { findFirst: jest.Mock };
    studentParentLink: { findUnique: jest.Mock };
    gradeRecord: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      class: { findUnique: jest.fn() },
      teacherClassAssignment: { findFirst: jest.fn() },
      studentClassEnrollment: { findFirst: jest.fn() },
      studentParentLink: { findUnique: jest.fn() },
      gradeRecord: { create: jest.fn(), findMany: jest.fn() },
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
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
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

  it('returns a student grade summary for self access', async () => {
    prisma.gradeRecord.findMany.mockResolvedValue([
      {
        score: 8,
        maxScore: 10,
        class: { id: 'class-1', name: 'Math' },
        student: { id: 'student-1', firstName: 'Ada', lastName: 'Lovelace' },
      },
      {
        score: 16,
        maxScore: 20,
        class: { id: 'class-2', name: 'Science' },
        student: { id: 'student-1', firstName: 'Ada', lastName: 'Lovelace' },
      },
    ]);

    await request(app.getHttpServer())
      .get('/grades/students/student-1/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .expect(200)
      .expect({
        studentId: 'student-1',
        gradeCount: 2,
        totalScore: 24,
        totalMaxScore: 30,
        percentage: 80,
        classes: [
          {
            classId: 'class-1',
            className: 'Math',
            gradeCount: 1,
            totalScore: 8,
            totalMaxScore: 10,
            percentage: 80,
          },
          {
            classId: 'class-2',
            className: 'Science',
            gradeCount: 1,
            totalScore: 16,
            totalMaxScore: 20,
            percentage: 80,
          },
        ],
      });
  });

  it('returns zeroed student summary when no grades are present', async () => {
    prisma.gradeRecord.findMany.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/grades/students/student-1/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .expect(200)
      .expect({
        studentId: 'student-1',
        gradeCount: 0,
        totalScore: 0,
        totalMaxScore: 0,
        percentage: null,
        classes: [],
      });
  });

  it('returns 403 when a parent requests an unlinked student summary', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/grades/students/student-1/summary')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .expect(403);

    expect(prisma.gradeRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns teacher-filtered student summary for an assigned teacher', async () => {
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    prisma.gradeRecord.findMany.mockResolvedValue([
      {
        score: 17,
        maxScore: 20,
        class: { id: 'class-1', name: 'Math' },
        student: { id: 'student-1', firstName: 'Ada', lastName: 'Lovelace' },
      },
    ]);

    await request(app.getHttpServer())
      .get('/grades/students/student-1/summary')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect({
        studentId: 'student-1',
        gradeCount: 1,
        totalScore: 17,
        totalMaxScore: 20,
        percentage: 85,
        classes: [
          {
            classId: 'class-1',
            className: 'Math',
            gradeCount: 1,
            totalScore: 17,
            totalMaxScore: 20,
            percentage: 85,
          },
        ],
      });

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

  it('returns a class grade summary for an assigned teacher', async () => {
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
    prisma.gradeRecord.findMany.mockResolvedValue([
      {
        score: 8,
        maxScore: 10,
        student: { id: 'student-1', firstName: 'Ada', lastName: 'Lovelace' },
      },
      {
        score: 7,
        maxScore: 10,
        student: { id: 'student-2', firstName: 'Alan', lastName: 'Turing' },
      },
      {
        score: 9,
        maxScore: 10,
        student: { id: 'student-1', firstName: 'Ada', lastName: 'Lovelace' },
      },
    ]);

    await request(app.getHttpServer())
      .get('/grades/classes/class-1/summary')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect({
        classId: 'class-1',
        gradeCount: 3,
        totalScore: 24,
        totalMaxScore: 30,
        percentage: 80,
        students: [
          {
            studentId: 'student-1',
            studentName: 'Ada Lovelace',
            gradeCount: 2,
            totalScore: 17,
            totalMaxScore: 20,
            percentage: 85,
          },
          {
            studentId: 'student-2',
            studentName: 'Alan Turing',
            gradeCount: 1,
            totalScore: 7,
            totalMaxScore: 10,
            percentage: 70,
          },
        ],
      });
  });

  it('returns zeroed class summary when no grades are present', async () => {
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
    prisma.gradeRecord.findMany.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/grades/classes/class-1/summary')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect({
        classId: 'class-1',
        gradeCount: 0,
        totalScore: 0,
        totalMaxScore: 0,
        percentage: null,
        students: [],
      });
  });

  it('returns 403 when a student requests class summary', async () => {
    await request(app.getHttpServer())
      .get('/grades/classes/class-1/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .expect(403);

    expect(prisma.gradeRecord.findMany).not.toHaveBeenCalled();
  });
});
