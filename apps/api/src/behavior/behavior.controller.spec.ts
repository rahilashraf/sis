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
import { BehaviorController } from './behavior.controller';
import { BehaviorService } from './behavior.service';

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
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];

    request.user = {
      id: Array.isArray(userId) ? userId[0] : userId,
      role: Array.isArray(role) ? role[0] : role,
      memberships: schoolIds.map((schoolId) => ({ schoolId, isActive: true })),
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

describe('BehaviorController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    user: { findUnique: jest.Mock };
    studentClassEnrollment: { findFirst: jest.Mock };
    behaviorRecord: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    behaviorCategoryOption: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    behaviorRecordAttachment: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      studentClassEnrollment: { findFirst: jest.fn() },
      behaviorRecord: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      behaviorCategoryOption: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      behaviorRecordAttachment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BehaviorController],
      providers: [
        BehaviorService,
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

  it('creates a behavior record for a student', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.behaviorCategoryOption.findUnique.mockResolvedValue({
      id: 'cat-1',
      name: 'Disruption',
      schoolId: null,
      isActive: true,
    });
    prisma.behaviorRecord.create.mockResolvedValue({
      id: 'record-1',
    });
    prisma.behaviorRecord.findUniqueOrThrow.mockResolvedValue({
      id: 'record-1',
      studentId: 'student-1',
      schoolId: 'school-1',
      recordedById: 'teacher-1',
      incidentAt: '2026-04-18T10:30:00.000Z',
      categoryOptionId: 'cat-1',
      categoryName: 'Disruption',
      severity: 'MEDIUM',
      incidentLevel: 'MINOR',
      type: 'INCIDENT',
      title: 'Class disruption',
      description: 'Repeated interruptions during lesson.',
      actionTaken: null,
      followUpRequired: false,
      parentContacted: false,
      status: 'OPEN',
      createdAt: '2026-04-18T10:31:00.000Z',
      updatedAt: '2026-04-18T10:31:00.000Z',
      recordedBy: {
        id: 'teacher-1',
        firstName: 'Ari',
        lastName: 'Khan',
        role: UserRole.TEACHER,
      },
      categoryOption: {
        id: 'cat-1',
        name: 'Disruption',
        schoolId: null,
      },
      incidentReport: null,
      attachments: [],
    });

    await request(app.getHttpServer())
      .post('/students/student-1/behavior-records')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .set('x-test-school-ids', 'school-1')
      .send({
        incidentAt: '2026-04-18T10:30:00.000Z',
        categoryOptionId: 'cat-1',
        severity: 'MEDIUM',
        type: 'INCIDENT',
        title: 'Class disruption',
        description: 'Repeated interruptions during lesson.',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.id).toBe('record-1');
        expect(response.body.categoryName).toBe('Disruption');
      });
  });

  it('fetches behavior records for a student', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.behaviorRecord.findMany.mockResolvedValue([
      {
        id: 'record-1',
        studentId: 'student-1',
        schoolId: 'school-1',
        recordedById: 'staff-1',
        incidentAt: '2026-04-18T10:30:00.000Z',
        categoryOptionId: 'cat-1',
        categoryName: 'Respect',
        severity: 'LOW',
        type: 'INCIDENT',
        title: 'Peer support',
        description: 'Helped a classmate.',
        actionTaken: null,
        followUpRequired: false,
        parentContacted: false,
        status: 'OPEN',
        createdAt: '2026-04-18T10:31:00.000Z',
        updatedAt: '2026-04-18T10:31:00.000Z',
        recordedBy: {
          id: 'staff-1',
          firstName: 'Nora',
          lastName: 'Lee',
          role: UserRole.STAFF,
        },
        categoryOption: { id: 'cat-1', name: 'Respect', schoolId: null },
        attachments: [],
      },
    ]);

    await request(app.getHttpServer())
      .get('/students/student-1/behavior-records')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .set('x-test-school-ids', 'school-1')
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0].type).toBe('INCIDENT');
      });
  });

  it('updates a behavior record', async () => {
    prisma.behaviorRecord.findUnique.mockResolvedValue({
      id: 'record-1',
      studentId: 'student-1',
      schoolId: 'school-1',
    });
    prisma.behaviorRecord.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'record-1',
      studentId: 'student-1',
      schoolId: 'school-1',
      recordedById: 'teacher-1',
      incidentAt: '2026-04-18T10:30:00.000Z',
      categoryOptionId: 'cat-1',
      categoryName: 'Disruption',
      severity: 'MEDIUM',
      incidentLevel: 'MINOR',
      type: 'INCIDENT',
      title: 'Class disruption',
      description: 'Repeated interruptions during lesson.',
      actionTaken: null,
      followUpRequired: false,
      parentContacted: false,
      status: 'OPEN',
      createdAt: '2026-04-18T10:31:00.000Z',
      updatedAt: '2026-04-18T10:31:00.000Z',
      recordedBy: {
        id: 'teacher-1',
        firstName: 'Ari',
        lastName: 'Khan',
        role: UserRole.TEACHER,
      },
      categoryOption: { id: 'cat-1', name: 'Disruption', schoolId: null },
      incidentReport: null,
      attachments: [],
    });
    prisma.behaviorRecord.update.mockResolvedValue({
      id: 'record-1',
    });
    prisma.behaviorRecord.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'record-1',
      studentId: 'student-1',
      schoolId: 'school-1',
      recordedById: 'teacher-1',
      incidentAt: '2026-04-18T10:30:00.000Z',
      categoryOptionId: 'cat-1',
      categoryName: 'Disruption',
      severity: 'HIGH',
      incidentLevel: 'MAJOR',
      type: 'INCIDENT',
      title: 'Class disruption',
      description: 'Repeated interruptions during lesson.',
      actionTaken: 'Met with student',
      followUpRequired: true,
      parentContacted: true,
      status: 'RESOLVED',
      createdAt: '2026-04-18T10:31:00.000Z',
      updatedAt: '2026-04-18T10:40:00.000Z',
      recordedBy: {
        id: 'teacher-1',
        firstName: 'Ari',
        lastName: 'Khan',
        role: UserRole.TEACHER,
      },
      categoryOption: { id: 'cat-1', name: 'Disruption', schoolId: null },
      incidentReport: null,
      attachments: [],
    });

    await request(app.getHttpServer())
      .patch('/behavior-records/record-1')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        status: 'RESOLVED',
        severity: 'HIGH',
        followUpRequired: true,
        parentContacted: true,
        actionTaken: 'Met with student',
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('RESOLVED');
        expect(response.body.severity).toBe('HIGH');
      });
  });

  it('enforces category management permissions', async () => {
    prisma.behaviorCategoryOption.create.mockResolvedValue({
      id: 'cat-1',
      schoolId: null,
      name: 'Bullying',
      isActive: true,
      sortOrder: 0,
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
    });

    await request(app.getHttpServer())
      .post('/behavior-categories')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({ name: 'Bullying' })
      .expect(201)
      .expect((response) => {
        expect(response.body.name).toBe('Bullying');
      });

    await request(app.getHttpServer())
      .post('/behavior-categories')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({ name: 'Bullying' })
      .expect(403);
  });

  it('rejects inactive category usage', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.behaviorCategoryOption.findUnique.mockResolvedValue({
      id: 'cat-1',
      name: 'Disruption',
      schoolId: null,
      isActive: false,
    });

    await request(app.getHttpServer())
      .post('/students/student-1/behavior-records')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .set('x-test-school-ids', 'school-1')
      .send({
        incidentAt: '2026-04-18T10:30:00.000Z',
        categoryOptionId: 'cat-1',
        severity: 'MEDIUM',
        type: 'INCIDENT',
        title: 'Class disruption',
        description: 'Repeated interruptions during lesson.',
      })
      .expect(400);
  });

  it('uploads and lists behavior attachments', async () => {
    prisma.behaviorRecord.findUnique.mockResolvedValue({
      id: 'record-1',
      studentId: 'student-1',
      schoolId: 'school-1',
    });
    prisma.behaviorRecordAttachment.create.mockResolvedValue({
      id: 'attachment-1',
      behaviorRecordId: 'record-1',
      uploadedById: 'staff-1',
      originalFileName: 'incident.pdf',
      mimeType: 'application/pdf',
      fileSize: 24,
      storagePath: 'school-1/record-1/incident.pdf',
      createdAt: '2026-04-18T10:31:00.000Z',
      updatedAt: '2026-04-18T10:31:00.000Z',
      uploadedBy: {
        id: 'staff-1',
        firstName: 'Nora',
        lastName: 'Lee',
        role: UserRole.STAFF,
      },
    });

    await request(app.getHttpServer())
      .post('/behavior-records/record-1/attachments')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .set('x-test-school-ids', 'school-1')
      .attach('file', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'), {
        filename: 'incident.pdf',
        contentType: 'application/pdf',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.id).toBe('attachment-1');
      });

    prisma.behaviorRecordAttachment.findMany.mockResolvedValue([
      {
        id: 'attachment-1',
        behaviorRecordId: 'record-1',
        uploadedById: 'staff-1',
        originalFileName: 'incident.pdf',
        mimeType: 'application/pdf',
        fileSize: 24,
        storagePath: 'school-1/record-1/incident.pdf',
        createdAt: '2026-04-18T10:31:00.000Z',
        updatedAt: '2026-04-18T10:31:00.000Z',
        uploadedBy: {
          id: 'staff-1',
          firstName: 'Nora',
          lastName: 'Lee',
          role: UserRole.STAFF,
        },
      },
    ]);

    await request(app.getHttpServer())
      .get('/behavior-records/record-1/attachments')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .set('x-test-school-ids', 'school-1')
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0].mimeType).toBe('application/pdf');
      });
  });

  it('rejects invalid attachment type', async () => {
    prisma.behaviorRecord.findUnique.mockResolvedValue({
      id: 'record-1',
      studentId: 'student-1',
      schoolId: 'school-1',
    });

    await request(app.getHttpServer())
      .post('/behavior-records/record-1/attachments')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .set('x-test-school-ids', 'school-1')
      .attach('file', Buffer.from('not a pdf'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  it('rejects school-scope access for non-bypass roles', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });

    await request(app.getHttpServer())
      .post('/students/student-1/behavior-records')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .set('x-test-school-ids', 'school-2')
      .send({
        incidentAt: '2026-04-18T10:30:00.000Z',
        categoryOptionId: 'cat-1',
        severity: 'MEDIUM',
        type: 'INCIDENT',
        title: 'Class disruption',
        description: 'Repeated interruptions during lesson.',
      })
      .expect(403);
  });
});
