import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { AttendanceService } from '../attendance/attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ParentsController } from './parents.controller';
import { ParentsService } from './parents.service';

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

describe('ParentsController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    studentParentLink: { findMany: jest.Mock; findUnique: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      studentParentLink: { findMany: jest.fn(), findUnique: jest.fn() },
      attendanceRecord: { findMany: jest.fn() },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ParentsController],
      providers: [
        ParentsService,
        AttendanceService,
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

  it('returns linked students for the logged-in parent', async () => {
    prisma.studentParentLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        student: {
          id: 'student-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          memberships: [
            {
              school: { id: 'school-1', name: 'School' },
            },
          ],
        },
      },
    ]);

    await request(app.getHttpServer())
      .get('/parents/me/students')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .expect(200)
      .expect([
        {
          id: 'link-1',
          student: {
            id: 'student-1',
            firstName: 'Ada',
            lastName: 'Lovelace',
            memberships: [
              {
                school: { id: 'school-1', name: 'School' },
              },
            ],
          },
        },
      ]);
  });

  it('returns 403 when a non-parent requests linked students', async () => {
    await request(app.getHttpServer())
      .get('/parents/me/students')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .expect(403);

    expect(prisma.studentParentLink.findMany).not.toHaveBeenCalled();
  });

  it('returns attendance summary for a linked child', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue({ id: 'link-1' });
    prisma.attendanceRecord.findMany.mockResolvedValue([
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.LATE },
      { status: AttendanceStatus.ABSENT },
    ]);

    await request(app.getHttpServer())
      .get('/parents/me/students/student-1/attendance/summary')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .query({
        startDate: '2026-04-01',
        endDate: '2026-04-03',
      })
      .expect(200)
      .expect({
        studentId: 'student-1',
        startDate: '2026-04-01',
        endDate: '2026-04-03',
        totalDays: 3,
        presentCount: 1,
        absentCount: 1,
        lateCount: 1,
        excusedCount: 0,
        attendancePercentage: 66.67,
      });
  });

  it('returns 403 when a non-parent requests a parent child summary', async () => {
    await request(app.getHttpServer())
      .get('/parents/me/students/student-1/attendance/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .query({
        startDate: '2026-04-01',
        endDate: '2026-04-03',
      })
      .expect(403);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when a parent is not linked to the child', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/parents/me/students/student-1/attendance/summary')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .query({
        startDate: '2026-04-01',
        endDate: '2026-04-03',
      })
      .expect(403);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 when parent child summary is missing startDate', async () => {
    await request(app.getHttpServer())
      .get('/parents/me/students/student-1/attendance/summary')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .query({
        endDate: '2026-04-03',
      })
      .expect(400);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });
});
