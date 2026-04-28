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
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-test-user-id'];
    const role = request.headers['x-test-role'];
    const schoolIdsHeader = request.headers['x-test-school-ids'];
    const schoolIdsRaw = Array.isArray(schoolIdsHeader)
      ? schoolIdsHeader[0]
      : schoolIdsHeader;
    const schoolIds =
      typeof schoolIdsRaw === 'string'
        ? schoolIdsRaw
            .split(',')
            .map((entry: string) => entry.trim())
            .filter(Boolean)
        : ['school-1'];

    request.user = {
      id: Array.isArray(userId) ? userId[0] : userId,
      role: Array.isArray(role) ? role[0] : role,
      memberships: schoolIds.map((schoolId: string) => ({
        schoolId,
        isActive: true,
      })),
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

describe('AssessmentsController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    class: { findUnique: jest.Mock };
    teacherClassAssignment: { findFirst: jest.Mock };
    assessmentType: { findUnique: jest.Mock };
    reportingPeriod: { findUnique: jest.Mock };
    assessment: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    assessmentResult: {
      count: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
    assessmentResultStatusLabel: {
      findMany: jest.Mock;
      createMany: jest.Mock;
    };
    studentClassEnrollment: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      class: { findUnique: jest.fn() },
      teacherClassAssignment: { findFirst: jest.fn() },
      assessmentType: { findUnique: jest.fn() },
      reportingPeriod: { findUnique: jest.fn() },
      assessment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      assessmentResult: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      assessmentResultStatusLabel: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      studentClassEnrollment: { findMany: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg({
            assessmentResult: {
              upsert: prisma.assessmentResult.upsert,
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            assessmentResultStatusLabel: {
              findMany: prisma.assessmentResultStatusLabel.findMany,
              createMany: prisma.assessmentResultStatusLabel.createMany,
            },
          });
        }

        if (Array.isArray(arg)) {
          return Promise.all(arg as Array<Promise<unknown>>);
        }

        return arg;
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AssessmentsController],
      providers: [
        AssessmentsService,
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

  it('creates an assessment for a teacher assigned to the class', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
    prisma.assessmentType.findUnique.mockResolvedValue({
      id: 'type-1',
      isActive: true,
    });
    prisma.assessment.create.mockResolvedValue({
      id: 'assessment-1',
      classId: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      title: 'Quiz 1',
      assessmentTypeId: 'type-1',
      maxScore: 10,
      dueAt: null,
      isPublishedToParents: false,
      createdByUserId: 'teacher-1',
      archivedAt: null,
      createdAt: new Date('2026-04-11T00:00:00.000Z'),
      updatedAt: new Date('2026-04-11T00:00:00.000Z'),
      assessmentType: { id: 'type-1', key: 'QUIZ', name: 'Quiz' },
    });

    await request(app.getHttpServer())
      .post('/assessments')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        classId: 'class-1',
        title: 'Quiz 1',
        assessmentTypeId: 'type-1',
        maxScore: 10,
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 'assessment-1',
          classId: 'class-1',
          title: 'Quiz 1',
          maxScore: 10,
          isPublishedToParents: false,
          assessmentType: { id: 'type-1', key: 'QUIZ', name: 'Quiz' },
        });
      });

    expect(prisma.teacherClassAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teacherId: 'teacher-1',
          classId: 'class-1',
        }),
      }),
    );

    expect(prisma.assessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classId: 'class-1',
          schoolId: 'school-1',
          schoolYearId: 'year-1',
          createdByUserId: 'teacher-1',
        }),
      }),
    );
  });

  it('returns 403 when a teacher is not assigned to the class', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/assessments')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        classId: 'class-1',
        title: 'Quiz 1',
        assessmentTypeId: 'type-1',
        maxScore: 10,
      })
      .expect(403);

    expect(prisma.assessment.create).not.toHaveBeenCalled();
  });

  it('upserts assessment grades in bulk and rejects duplicate student entries', async () => {
    prisma.assessment.findUnique.mockResolvedValue({
      id: 'assessment-1',
      classId: 'class-1',
      maxScore: 10,
      archivedAt: null,
      isActive: true,
      assessmentType: { id: 'type-1', key: 'QUIZ', name: 'Quiz' },
    });
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { studentId: 'student-1' },
      { studentId: 'student-2' },
    ]);
    prisma.assessmentResult.upsert
      .mockResolvedValueOnce({
        id: 'result-1',
        studentId: 'student-1',
        score: 8,
        comment: null,
      })
      .mockResolvedValueOnce({
        id: 'result-2',
        studentId: 'student-2',
        score: 7,
        comment: 'Nice work',
      });

    await request(app.getHttpServer())
      .post('/assessments/assessment-1/grades')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        grades: [
          { studentId: 'student-1', score: 8 },
          { studentId: 'student-2', score: 7, comment: 'Nice work' },
        ],
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual([
          { id: 'result-1', studentId: 'student-1', score: 8, comment: null },
          {
            id: 'result-2',
            studentId: 'student-2',
            score: 7,
            comment: 'Nice work',
          },
        ]);
      });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.assessmentResult.upsert).toHaveBeenCalledTimes(2);

    await request(app.getHttpServer())
      .post('/assessments/assessment-1/grades')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        grades: [
          { studentId: 'student-1', score: 8 },
          { studentId: 'student-1', score: 9 },
        ],
      })
      .expect(400);
  });
});
