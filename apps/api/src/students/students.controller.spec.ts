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
import { StudentsController } from './students.controller';

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

describe('StudentsController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    attendanceRecord: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      attendanceRecord: { findMany: jest.fn() },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [
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

  it('returns student self attendance summary', async () => {
    prisma.attendanceRecord.findMany.mockResolvedValue([
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.EXCUSED },
    ]);

    await request(app.getHttpServer())
      .get('/students/me/attendance/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .query({
        startDate: '2026-04-01',
        endDate: '2026-04-02',
      })
      .expect(200)
      .expect({
        studentId: 'student-1',
        startDate: '2026-04-01',
        endDate: '2026-04-02',
        totalDays: 2,
        presentCount: 1,
        absentCount: 0,
        lateCount: 0,
        excusedCount: 1,
        attendancePercentage: 50,
      });
  });

  it('returns 403 when a non-student requests the student self summary route', async () => {
    await request(app.getHttpServer())
      .get('/students/me/attendance/summary')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .query({
        startDate: '2026-04-01',
        endDate: '2026-04-02',
      })
      .expect(403);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 when student self summary is missing startDate', async () => {
    await request(app.getHttpServer())
      .get('/students/me/attendance/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .query({
        endDate: '2026-04-02',
      })
      .expect(400);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 when student self summary has an invalid endDate', async () => {
    await request(app.getHttpServer())
      .get('/students/me/attendance/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .query({
        startDate: '2026-04-01',
        endDate: 'not-a-date',
      })
      .expect(400);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });
});
