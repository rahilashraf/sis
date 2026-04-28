import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, UserRole } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolYearsController } from './school-years.controller';
import { SchoolYearsService } from './school-years.service';

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

describe('SchoolYearsController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    school: { findUnique: jest.Mock };
    schoolYear: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    class: {
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      school: {
        findUnique: jest.fn(),
      },
      schoolYear: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      class: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: typeof prisma) => unknown) =>
        callback(prisma),
      ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SchoolYearsController],
      providers: [
        SchoolYearsService,
        Reflector,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn(), logCritical: jest.fn() },
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

  it('creates a school year for owner/super admin roles', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1' });
    prisma.schoolYear.create.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      name: '2025-2026',
      isActive: false,
      school: { id: 'school-1', name: 'North School' },
    });

    await request(app.getHttpServer())
      .post('/school-years')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({
        schoolId: 'school-1',
        name: '2025-2026',
        startDate: '2025-09-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
      })
      .expect(201)
      .expect({
        id: 'year-1',
        schoolId: 'school-1',
        name: '2025-2026',
        isActive: false,
        school: { id: 'school-1', name: 'North School' },
      });

    expect(prisma.schoolYear.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: 'school-1',
          name: '2025-2026',
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      }),
    );
  });

  it('returns 403 when admin creates a school year', async () => {
    await request(app.getHttpServer())
      .post('/school-years')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        schoolId: 'school-1',
        name: '2025-2026',
        startDate: '2025-09-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
      })
      .expect(403);

    expect(prisma.school.findUnique).not.toHaveBeenCalled();
    expect(prisma.schoolYear.create).not.toHaveBeenCalled();
  });

  it('lists school years for a school for authenticated users', async () => {
    prisma.schoolYear.findMany.mockResolvedValue([
      {
        id: 'year-1',
        schoolId: 'school-1',
        name: '2025-2026',
        isActive: true,
      },
    ]);

    await request(app.getHttpServer())
      .get('/school-years')
      .query({ schoolId: 'school-1' })
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect([
        {
          id: 'year-1',
          schoolId: 'school-1',
          name: '2025-2026',
          isActive: true,
        },
      ]);
  });

  it('accepts includeInactive=true on the list request under strict validation', async () => {
    prisma.schoolYear.findMany.mockResolvedValue([
      {
        id: 'year-1',
        schoolId: 'school-1',
        name: '2025-2026',
        isActive: false,
      },
    ]);

    await request(app.getHttpServer())
      .get('/school-years')
      .query({ schoolId: 'school-1', includeInactive: true })
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200);

    expect(prisma.schoolYear.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolId: 'school-1' }),
      }),
    );
  });

  it('rejects unknown query parameters under strict validation', async () => {
    await request(app.getHttpServer())
      .get('/school-years')
      .query({ schoolId: 'school-1', includeInactive: true, unexpected: 'value' })
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toContain('property unexpected should not exist');
      });
  });

  it('returns 400 when schoolId is missing from the list request', async () => {
    await request(app.getHttpServer())
      .get('/school-years')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(400);

    expect(prisma.schoolYear.findMany).not.toHaveBeenCalled();
  });

  it('activates a school year and deactivates others in the same school', async () => {
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-2',
      schoolId: 'school-1',
    });
    prisma.schoolYear.updateMany.mockResolvedValue({ count: 1 });
    prisma.schoolYear.update.mockResolvedValue({
      id: 'year-2',
      schoolId: 'school-1',
      name: '2026-2027',
      isActive: true,
      school: { id: 'school-1', name: 'North School' },
    });

    await request(app.getHttpServer())
      .patch('/school-years/year-2/activate')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .expect(200)
      .expect({
        id: 'year-2',
        schoolId: 'school-1',
        name: '2026-2027',
        isActive: true,
        school: { id: 'school-1', name: 'North School' },
      });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.schoolYear.updateMany).toHaveBeenCalledWith({
      where: {
        schoolId: 'school-1',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
    expect(prisma.schoolYear.update).toHaveBeenCalledWith({
      where: { id: 'year-2' },
      data: {
        isActive: true,
      },
      include: {
        school: true,
      },
    });
  });

  it('returns 403 when admin activates a school year', async () => {
    await request(app.getHttpServer())
      .patch('/school-years/year-1/activate')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .expect(403);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ends a school year for owner/super admin roles', async () => {
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
    });
    prisma.class.updateMany.mockResolvedValue({ count: 2 });
    prisma.schoolYear.update.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      name: '2025-2026',
      isActive: false,
      school: { id: 'school-1', name: 'North School' },
    });

    await request(app.getHttpServer())
      .patch('/school-years/year-1/end')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .expect(200)
      .expect({
        id: 'year-1',
        schoolId: 'school-1',
        name: '2025-2026',
        isActive: false,
        school: { id: 'school-1', name: 'North School' },
      });

    expect(prisma.class.updateMany).toHaveBeenCalledWith({
      where: {
        schoolYearId: 'year-1',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
  });

  it('deactivates a school year through the alias endpoint', async () => {
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
    });
    prisma.class.updateMany.mockResolvedValue({ count: 1 });
    prisma.schoolYear.update.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      name: '2025-2026',
      isActive: false,
      school: { id: 'school-1', name: 'North School' },
    });

    await request(app.getHttpServer())
      .patch('/school-years/year-1/deactivate')
      .set('x-test-user-id', 'super-admin-1')
      .set('x-test-role', UserRole.SUPER_ADMIN)
      .expect(200)
      .expect({
        id: 'year-1',
        schoolId: 'school-1',
        name: '2025-2026',
        isActive: false,
        school: { id: 'school-1', name: 'North School' },
      });
  });

  it('returns 400 when creating a school year with an invalid date range', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1' });

    await request(app.getHttpServer())
      .post('/school-years')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({
        schoolId: 'school-1',
        name: '2025-2026',
        startDate: '2026-06-30T00:00:00.000Z',
        endDate: '2025-09-01T00:00:00.000Z',
      })
      .expect(400);

    expect(prisma.schoolYear.create).not.toHaveBeenCalled();
  });

  it('deletes an empty school year for owner/super admin access', async () => {
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      _count: {
        classes: 0,
        attendanceSessions: 0,
        reportingPeriods: 0,
      },
    });
    prisma.schoolYear.delete.mockResolvedValue({ id: 'year-1' });

    await request(app.getHttpServer())
      .delete('/school-years/year-1')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .expect(200)
      .expect({ success: true });
  });

  it('returns 409 when delete reaches a relational conflict', async () => {
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
      _count: {
        classes: 0,
        attendanceSessions: 0,
        reportingPeriods: 0,
      },
    });
    prisma.schoolYear.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('constraint failed', {
        code: 'P2003',
        clientVersion: 'test',
      }),
    );

    await request(app.getHttpServer())
      .delete('/school-years/year-1')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .expect(409)
      .expect({
        statusCode: 409,
        message: 'School year cannot be deleted because related records still exist',
        error: 'Conflict',
      });
  });

  it('returns 403 when a staff role deletes a school year', async () => {
    await request(app.getHttpServer())
      .delete('/school-years/year-1')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .expect(403);

    expect(prisma.schoolYear.findUnique).not.toHaveBeenCalled();
    expect(prisma.schoolYear.delete).not.toHaveBeenCalled();
  });
});
