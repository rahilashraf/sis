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
import { ReportingPeriodsController } from './reporting-periods.controller';
import { ReportingPeriodsService } from './reporting-periods.service';

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-test-user-id'];
    const role = request.headers['x-test-role'];
    const schoolIdsHeader = request.headers['x-test-school-ids'];
    const schoolIds = String(schoolIdsHeader ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    request.user = {
      id: Array.isArray(userId) ? userId[0] : userId,
      role: Array.isArray(role) ? role[0] : role,
      memberships: schoolIds.map((schoolId) => ({
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

describe('ReportingPeriodsController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    school: { findUnique: jest.Mock };
    schoolYear: { findUnique: jest.Mock };
    reportingPeriod: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      school: {
        findUnique: jest.fn(),
      },
      schoolYear: {
        findUnique: jest.fn(),
      },
      reportingPeriod: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ReportingPeriodsController],
      providers: [
        ReportingPeriodsService,
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

  it('creates a reporting period for an admin-like user with school access', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1' });
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T23:59:59.999Z'),
    });
    prisma.reportingPeriod.findFirst.mockResolvedValue(null);
    prisma.reportingPeriod.create.mockResolvedValue({
      id: 'period-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      name: 'Term 1',
      key: 'term-1',
      order: 1,
      school: { id: 'school-1', name: 'North School' },
      schoolYear: { id: 'year-1', name: '2025-2026' },
    });

    await request(app.getHttpServer())
      .post('/reporting-periods')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.OWNER)
      .set('x-test-school-ids', 'school-1')
      .send({
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        name: 'Term 1',
        key: 'term-1',
        order: 1,
        startsAt: '2025-09-01T00:00:00.000Z',
        endsAt: '2025-11-15T00:00:00.000Z',
      })
      .expect(201)
      .expect({
        id: 'period-1',
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        name: 'Term 1',
        key: 'term-1',
        order: 1,
        school: { id: 'school-1', name: 'North School' },
        schoolYear: { id: 'year-1', name: '2025-2026' },
      });

    expect(prisma.reportingPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: 'school-1',
          schoolYearId: 'year-1',
          name: 'Term 1',
          key: 'term-1',
          order: 1,
          startsAt: expect.any(Date),
          endsAt: expect.any(Date),
        }),
      }),
    );
  });

  it('lists reporting periods for an authenticated user with school access', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1' });
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T23:59:59.999Z'),
    });
    prisma.reportingPeriod.findMany.mockResolvedValue([
      {
        id: 'period-1',
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        name: 'Term 1',
        key: 'term-1',
        order: 1,
      },
    ]);

    await request(app.getHttpServer())
      .get('/reporting-periods')
      .query({ schoolId: 'school-1', schoolYearId: 'year-1' })
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .set('x-test-school-ids', 'school-1')
      .expect(200)
      .expect([
        {
          id: 'period-1',
          schoolId: 'school-1',
          schoolYearId: 'year-1',
          name: 'Term 1',
          key: 'term-1',
          order: 1,
        },
      ]);
  });

  it('updates a reporting period for an admin-like user with school access', async () => {
    prisma.reportingPeriod.findUnique
      .mockResolvedValueOnce({
        id: 'period-1',
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        isActive: true,
        isLocked: false,
        startsAt: new Date('2025-09-01T00:00:00.000Z'),
        endsAt: new Date('2025-11-15T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'period-1',
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        name: 'Term 1 Updated',
        key: 'term-1',
        order: 1,
        school: { id: 'school-1', name: 'North School' },
        schoolYear: { id: 'year-1', name: '2025-2026' },
      });
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1' });
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T23:59:59.999Z'),
    });
    prisma.reportingPeriod.findFirst.mockResolvedValue(null);
    prisma.reportingPeriod.update.mockResolvedValue({
      id: 'period-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      name: 'Term 1 Updated',
      key: 'term-1',
      order: 1,
      school: { id: 'school-1', name: 'North School' },
      schoolYear: { id: 'year-1', name: '2025-2026' },
    });

    await request(app.getHttpServer())
      .patch('/reporting-periods/period-1')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.OWNER)
      .set('x-test-school-ids', 'school-1')
      .send({
        name: 'Term 1 Updated',
      })
      .expect(200)
      .expect({
        id: 'period-1',
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        name: 'Term 1 Updated',
        key: 'term-1',
        order: 1,
        school: { id: 'school-1', name: 'North School' },
        schoolYear: { id: 'year-1', name: '2025-2026' },
      });
  });

  it('archives a reporting period for a high privilege user with school access', async () => {
    prisma.reportingPeriod.findUnique.mockResolvedValue({
      id: 'period-1',
      schoolId: 'school-1',
    });
    prisma.reportingPeriod.update.mockResolvedValue({
      id: 'period-1',
      schoolId: 'school-1',
      isActive: false,
      school: { id: 'school-1', name: 'North School' },
      schoolYear: { id: 'year-1', name: '2025-2026' },
    });

    await request(app.getHttpServer())
      .patch('/reporting-periods/period-1/archive')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .set('x-test-school-ids', 'school-1')
      .expect(200)
      .expect({
        id: 'period-1',
        schoolId: 'school-1',
        isActive: false,
        school: { id: 'school-1', name: 'North School' },
        schoolYear: { id: 'year-1', name: '2025-2026' },
      });
  });

  it('locks a reporting period for a high privilege user with school access', async () => {
    prisma.reportingPeriod.findUnique.mockResolvedValue({
      id: 'period-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      isActive: true,
      isLocked: false,
      school: { id: 'school-1', name: 'North School' },
      schoolYear: { id: 'year-1', name: '2025-2026' },
    });
    prisma.reportingPeriod.update.mockResolvedValue({
      id: 'period-1',
      schoolId: 'school-1',
      isLocked: true,
      school: { id: 'school-1', name: 'North School' },
      schoolYear: { id: 'year-1', name: '2025-2026' },
    });

    await request(app.getHttpServer())
      .patch('/reporting-periods/period-1/lock')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .set('x-test-school-ids', 'school-1')
      .expect(200)
      .expect({
        id: 'period-1',
        schoolId: 'school-1',
        isLocked: true,
        school: { id: 'school-1', name: 'North School' },
        schoolYear: { id: 'year-1', name: '2025-2026' },
      });
  });

  it('returns 409 when creating an overlapping reporting period', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1' });
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T23:59:59.999Z'),
    });
    prisma.reportingPeriod.findFirst.mockResolvedValue({
      id: 'period-existing',
    });

    await request(app.getHttpServer())
      .post('/reporting-periods')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.OWNER)
      .set('x-test-school-ids', 'school-1')
      .send({
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        name: 'Term 2',
        key: 'term-2',
        order: 2,
        startsAt: '2025-11-01T00:00:00.000Z',
        endsAt: '2025-12-15T00:00:00.000Z',
      })
      .expect(409);

    expect(prisma.reportingPeriod.create).not.toHaveBeenCalled();
  });

  it('returns 400 when schoolYearId does not belong to schoolId', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1' });
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-2',
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T23:59:59.999Z'),
    });

    await request(app.getHttpServer())
      .post('/reporting-periods')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.OWNER)
      .set('x-test-school-ids', 'school-1')
      .send({
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        name: 'Term 1',
        key: 'term-1',
        order: 1,
        startsAt: '2025-09-01T00:00:00.000Z',
        endsAt: '2025-11-15T00:00:00.000Z',
      })
      .expect(400);

    expect(prisma.reportingPeriod.findFirst).not.toHaveBeenCalled();
    expect(prisma.reportingPeriod.create).not.toHaveBeenCalled();
  });
});
