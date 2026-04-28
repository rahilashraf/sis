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
import { EnrollmentHistoryController } from './enrollment-history.controller';
import { EnrollmentHistoryService } from './enrollment-history.service';

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

describe('EnrollmentHistoryController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    user: { findUnique: jest.Mock };
    enrollmentHistory: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    enrollmentHistorySubject: {
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    enrollmentSubjectOption: {
      findMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      enrollmentHistory: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      enrollmentHistorySubject: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      enrollmentSubjectOption: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        enrollmentHistory: {
          create: prisma.enrollmentHistory.create,
          update: prisma.enrollmentHistory.update,
          findUniqueOrThrow: prisma.enrollmentHistory.findUniqueOrThrow,
        },
        enrollmentHistorySubject: {
          createMany: prisma.enrollmentHistorySubject.createMany,
          deleteMany: prisma.enrollmentHistorySubject.deleteMany,
        },
      }),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [EnrollmentHistoryController],
      providers: [
        EnrollmentHistoryService,
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

  it('creates enrollment history with selected subject names', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.enrollmentHistory.findUnique.mockResolvedValue(null);
    prisma.enrollmentSubjectOption.findMany.mockResolvedValue([
      { id: 'opt-1', name: 'Mathematics' },
      { id: 'opt-2', name: 'English' },
    ]);
    prisma.enrollmentHistory.create.mockResolvedValue({
      id: 'history-1',
      studentId: 'student-1',
    });
    prisma.enrollmentHistorySubject.createMany.mockResolvedValue({ count: 2 });
    prisma.enrollmentHistory.findUniqueOrThrow.mockResolvedValue({
      id: 'history-1',
      studentId: 'student-1',
      dateOfEnrollment: new Date('2026-09-01T00:00:00.000Z'),
      dateOfDeparture: null,
      previousSchoolName: null,
      status: 'ACTIVE',
      notes: null,
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      subjects: [
        {
          id: 'subj-1',
          enrollmentHistoryId: 'history-1',
          subjectName: 'Mathematics',
          sortOrder: 0,
          createdAt: new Date('2026-09-02T00:00:00.000Z'),
          updatedAt: new Date('2026-09-02T00:00:00.000Z'),
        },
        {
          id: 'subj-2',
          enrollmentHistoryId: 'history-1',
          subjectName: 'English',
          sortOrder: 1,
          createdAt: new Date('2026-09-02T00:00:00.000Z'),
          updatedAt: new Date('2026-09-02T00:00:00.000Z'),
        },
      ],
    });

    await request(app.getHttpServer())
      .post('/enrollment-history/students/student-1')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        dateOfEnrollment: '2026-09-01',
        status: 'ACTIVE',
        subjectOptionIds: ['opt-1', 'opt-2'],
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.studentId).toBe('student-1');
        expect(response.body.selectedSubjects).toEqual(['Mathematics', 'English']);
      });
  });

  it('rejects duplicate enrollment history for the same student', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.enrollmentHistory.findUnique.mockResolvedValue({
      id: 'history-1',
    });

    await request(app.getHttpServer())
      .post('/enrollment-history/students/student-1')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        dateOfEnrollment: '2026-09-01',
        status: 'ACTIVE',
      })
      .expect(409);
  });

  it('fetches enrollment history for a student', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.enrollmentHistory.findUnique.mockResolvedValue({
      id: 'history-1',
      studentId: 'student-1',
      dateOfEnrollment: new Date('2026-09-01T00:00:00.000Z'),
      dateOfDeparture: null,
      previousSchoolName: 'Old School',
      status: 'ACTIVE',
      notes: null,
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      subjects: [
        {
          id: 'subj-1',
          enrollmentHistoryId: 'history-1',
          subjectName: 'Mathematics',
          sortOrder: 0,
          createdAt: new Date('2026-09-02T00:00:00.000Z'),
          updatedAt: new Date('2026-09-02T00:00:00.000Z'),
        },
      ],
    });

    await request(app.getHttpServer())
      .get('/enrollment-history/students/student-1')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe('history-1');
        expect(response.body.selectedSubjects).toEqual(['Mathematics']);
      });
  });

  it('updates enrollment history details', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.enrollmentHistory.findUnique.mockResolvedValue({
      id: 'history-1',
      studentId: 'student-1',
      dateOfEnrollment: new Date('2026-09-01T00:00:00.000Z'),
      dateOfDeparture: null,
      previousSchoolName: null,
      status: 'ACTIVE',
      notes: null,
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      subjects: [],
    });
    prisma.enrollmentHistory.update.mockResolvedValue({
      id: 'history-1',
      studentId: 'student-1',
      dateOfEnrollment: new Date('2026-09-01T00:00:00.000Z'),
      dateOfDeparture: new Date('2027-06-30T00:00:00.000Z'),
      previousSchoolName: null,
      status: 'GRADUATED',
      notes: 'Completed program',
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2027-06-30T00:00:00.000Z'),
      subjects: [],
    });

    await request(app.getHttpServer())
      .patch('/enrollment-history/students/student-1')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        status: 'GRADUATED',
        dateOfDeparture: '2027-06-30',
        notes: 'Completed program',
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('GRADUATED');
        expect(response.body.notes).toBe('Completed program');
      });
  });

  it('allows owner to manage subject options and blocks admin role', async () => {
    prisma.enrollmentSubjectOption.create.mockResolvedValue({
      id: 'opt-1',
      name: 'Science',
      isActive: true,
      sortOrder: 0,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .post('/enrollment-history/subject-options')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({ name: 'Science', sortOrder: 0 })
      .expect(201)
      .expect((response) => {
        expect(response.body.name).toBe('Science');
      });

    await request(app.getHttpServer())
      .post('/enrollment-history/subject-options')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({ name: 'Science', sortOrder: 0 })
      .expect(403);
  });
});
