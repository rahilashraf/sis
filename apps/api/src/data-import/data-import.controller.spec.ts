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
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    request.user = {
      id: request.headers['x-test-user-id'],
      role: request.headers['x-test-role'],
      memberships: [{ schoolId: 'school-1', isActive: true }],
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

describe('DataImportController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    school: { findUnique: jest.Mock };
    user: { findMany: jest.Mock; create: jest.Mock };
    gradeLevel: { findMany: jest.Mock };
    schoolYear: { findMany: jest.Mock };
    enrollmentSubjectOption: { findMany: jest.Mock };
    class: { findMany: jest.Mock; create: jest.Mock };
    libraryItem: { findMany: jest.Mock; create: jest.Mock };
    studentParentLink: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      school: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1' }) },
      user: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      gradeLevel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'grade-1', name: 'Grade 1', isActive: true },
        ]),
      },
      schoolYear: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'year-1', name: '2025-2026' },
        ]),
      },
      enrollmentSubjectOption: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'subject-1', name: 'Math' },
        ]),
      },
      class: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      libraryItem: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      studentParentLink: { create: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: typeof prisma) => unknown) =>
        callback(prisma),
      ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DataImportController],
      providers: [
        DataImportService,
        Reflector,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
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

  it('returns a preview for valid student csv input', async () => {
    await request(app.getHttpServer())
      .post('/data-import/preview')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        schoolId: 'school-1',
        entityType: 'students',
        duplicateStrategy: 'fail',
        csvContent:
          'username,firstName,lastName,password,gradeLevelName\nstudent1,Ali,Khan,password123,Grade 1',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.summary.createCount).toBe(1);
      });
  });

  it('returns 403 for staff executing import preview route', async () => {
    await request(app.getHttpServer())
      .post('/data-import/preview')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .send({
        schoolId: 'school-1',
        entityType: 'users',
        duplicateStrategy: 'fail',
        csvContent: 'username,firstName,lastName,password,role\nstaff1,Sam,User,password123,STAFF',
      })
      .expect(403);
  });
});
