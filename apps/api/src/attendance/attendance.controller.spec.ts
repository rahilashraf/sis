import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole, AttendanceStatus } from '@prisma/client';
import request from 'supertest';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

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
  canActivate(): boolean {
    return true;
  }
}

describe('AttendanceController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    teacherClassAssignment: { findMany: jest.Mock };
    studentParentLink: { findUnique: jest.Mock };
    studentClassEnrollment: { findFirst: jest.Mock; findMany: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    attendanceSession: { findUnique: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      teacherClassAssignment: { findMany: jest.fn() },
      studentParentLink: { findUnique: jest.fn() },
      studentClassEnrollment: { findFirst: jest.fn(), findMany: jest.fn() },
      attendanceRecord: { findMany: jest.fn() },
      attendanceSession: { findUnique: jest.fn(), delete: jest.fn() },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        AttendanceService,
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

  it('returns student summary over HTTP for allowed access', async () => {
    prisma.attendanceRecord.findMany.mockResolvedValue([
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.ABSENT },
      { status: AttendanceStatus.LATE },
    ]);

    await request(app.getHttpServer())
      .get('/attendance/students/student-1/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
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

  it('returns 403 over HTTP when a student requests another student summary', async () => {
    await request(app.getHttpServer())
      .get('/attendance/students/student-2/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .query({
        startDate: '2026-04-01',
        endDate: '2026-04-03',
      })
      .expect(403);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 over HTTP when a parent is not linked to the student', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/attendance/students/student-1/summary')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .query({
        startDate: '2026-04-01',
        endDate: '2026-04-03',
      })
      .expect(403);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 over HTTP when startDate is missing', async () => {
    await request(app.getHttpServer())
      .get('/attendance/students/student-1/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .query({
        endDate: '2026-04-03',
      })
      .expect(400);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 over HTTP when endDate is invalid', async () => {
    await request(app.getHttpServer())
      .get('/attendance/students/student-1/summary')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .query({
        startDate: '2026-04-01',
        endDate: 'not-a-date',
      })
      .expect(400);

    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 over HTTP when attendance sessions query is missing date', async () => {
    await request(app.getHttpServer())
      .get('/attendance/sessions')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .query({
        schoolId: 'school-1',
      })
      .expect(400);
  });

  it('returns 400 over HTTP when by-date query has an invalid date', async () => {
    await request(app.getHttpServer())
      .get('/attendance/students/student-1/by-date')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .query({
        date: 'not-a-date',
      })
      .expect(400);
  });

  it('returns a single attendance session over HTTP for allowed teacher access', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      school: { id: 'school-1', name: 'School' },
      schoolYear: null,
      takenBy: { id: 'teacher-2' },
      classes: [
        { classId: 'class-a', class: { id: 'class-a', name: 'Math' } },
        { classId: 'class-b', class: { id: 'class-b', name: 'Science' } },
      ],
      records: [
        {
          studentId: 'student-a',
          student: { id: 'student-a', firstName: 'Ada' },
        },
        {
          studentId: 'student-b',
          student: { id: 'student-b', firstName: 'Ben' },
        },
      ],
    });
    prisma.teacherClassAssignment.findMany.mockResolvedValue([
      { classId: 'class-a' },
    ]);
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { studentId: 'student-a' },
    ]);

    await request(app.getHttpServer())
      .get('/attendance/sessions/session-1')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect({
        id: 'session-1',
        school: { id: 'school-1', name: 'School' },
        schoolYear: null,
        takenBy: { id: 'teacher-2' },
        classes: [
          { classId: 'class-a', class: { id: 'class-a', name: 'Math' } },
        ],
        records: [
          {
            studentId: 'student-a',
            student: { id: 'student-a', firstName: 'Ada' },
          },
        ],
      });
  });

  it('returns 403 over HTTP when a teacher cannot access a session', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      school: { id: 'school-1', name: 'School' },
      schoolYear: null,
      takenBy: { id: 'teacher-2' },
      classes: [
        { classId: 'class-b', class: { id: 'class-b', name: 'Science' } },
      ],
      records: [
        {
          studentId: 'student-b',
          student: { id: 'student-b', firstName: 'Ben' },
        },
      ],
    });
    prisma.teacherClassAssignment.findMany.mockResolvedValue([]);
    prisma.studentClassEnrollment.findMany.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/attendance/sessions/session-1')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);
  });

  it('returns 403 over HTTP when a student requests a session', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      school: { id: 'school-1', name: 'School' },
      schoolYear: null,
      takenBy: { id: 'teacher-2' },
      classes: [{ classId: 'class-a', class: { id: 'class-a', name: 'Math' } }],
      records: [],
    });

    await request(app.getHttpServer())
      .get('/attendance/sessions/session-1')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .expect(403);
  });

  it('returns 404 over HTTP when a session is not found', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/attendance/sessions/missing-session')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .expect(404);
  });

  it('deletes an attendance session over HTTP for allowed admin access', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      classes: [{ classId: 'class-a' }],
    });
    prisma.attendanceSession.delete.mockResolvedValue({
      id: 'session-1',
      school: { id: 'school-1', name: 'School' },
      schoolYear: null,
      takenBy: { id: 'admin-1' },
      classes: [{ classId: 'class-a', class: { id: 'class-a', name: 'Math' } }],
      records: [
        {
          studentId: 'student-a',
          student: { id: 'student-a', firstName: 'Ada' },
        },
      ],
    });

    await request(app.getHttpServer())
      .delete('/attendance/sessions/session-1')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .expect(200)
      .expect({
        id: 'session-1',
        school: { id: 'school-1', name: 'School' },
        schoolYear: null,
        takenBy: { id: 'admin-1' },
        classes: [
          { classId: 'class-a', class: { id: 'class-a', name: 'Math' } },
        ],
        records: [
          {
            studentId: 'student-a',
            student: { id: 'student-a', firstName: 'Ada' },
          },
        ],
      });
  });

  it('returns 403 over HTTP when a teacher tries to delete a session with unassigned classes', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      classes: [{ classId: 'class-a' }, { classId: 'class-b' }],
    });
    prisma.teacherClassAssignment.findMany.mockResolvedValue([
      { classId: 'class-a' },
    ]);

    await request(app.getHttpServer())
      .delete('/attendance/sessions/session-1')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.attendanceSession.delete).not.toHaveBeenCalled();
  });

  it('returns 403 over HTTP when a parent tries to delete a session', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue({
      id: 'session-1',
      classes: [{ classId: 'class-a' }],
    });

    await request(app.getHttpServer())
      .delete('/attendance/sessions/session-1')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .expect(403);

    expect(prisma.attendanceSession.delete).not.toHaveBeenCalled();
  });

  it('returns 404 over HTTP when deleting a missing session', async () => {
    prisma.attendanceSession.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .delete('/attendance/sessions/missing-session')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .expect(404);
  });
});
