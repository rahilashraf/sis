import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceStatus, StudentGender, UserRole } from '@prisma/client';
import request from 'supertest';
import { AttendanceService } from '../attendance/attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { GradebookService } from '../gradebook/gradebook.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

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
  let gradebook: { getStudentGrades: jest.Mock; getStudentSummary: jest.Mock };
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    studentParentLink: { findMany: jest.Mock; findUnique: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    gradebook = {
      getStudentGrades: jest.fn(),
      getStudentSummary: jest.fn(),
    };

    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      studentParentLink: { findMany: jest.fn(), findUnique: jest.fn() },
      attendanceRecord: { findMany: jest.fn() },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [
        AttendanceService,
        StudentsService,
        {
          provide: GradebookService,
          useValue: gradebook,
        },
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

  it('returns linked parents for a student to owner access', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.studentParentLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        parentId: 'parent-1',
        studentId: 'student-1',
        createdAt: '2026-04-11T00:00:00.000Z',
        updatedAt: '2026-04-11T00:00:00.000Z',
        parent: {
          id: 'parent-1',
          firstName: 'Grace',
          lastName: 'Hopper',
        },
      },
    ]);

    await request(app.getHttpServer())
      .get('/students/student-1/parents')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .expect(200)
      .expect([
        {
          id: 'link-1',
          parentId: 'parent-1',
          studentId: 'student-1',
          createdAt: '2026-04-11T00:00:00.000Z',
          updatedAt: '2026-04-11T00:00:00.000Z',
          parent: {
            id: 'parent-1',
            firstName: 'Grace',
            lastName: 'Hopper',
          },
        },
      ]);
  });

  it('returns a student profile for a linked parent', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.studentParentLink.findUnique.mockResolvedValue({ id: 'link-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'student-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: UserRole.STUDENT,
      dateOfBirth: '2014-05-06T00:00:00.000Z',
      city: 'Toronto',
      healthCardNumber: '1234567890',
      memberships: [],
    });

    await request(app.getHttpServer())
      .get('/students/student-1')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .expect(200)
      .expect({
        id: 'student-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: UserRole.STUDENT,
        dateOfBirth: '2014-05-06T00:00:00.000Z',
        city: 'Toronto',
        healthCardNumber: '******7890',
        memberships: [],
      });
  });

  it('falls back to the legacy student shape when profile columns are missing', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.user.findUniqueOrThrow
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'The column `User.dateOfBirth` does not exist in the current database.',
        meta: {
          column: 'User.dateOfBirth',
        },
      })
      .mockResolvedValueOnce({
        id: 'student-1',
        username: 'ada.student',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: UserRole.STUDENT,
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
        memberships: [],
      });

    await request(app.getHttpServer())
      .get('/students/student-1')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .expect(200)
      .expect({
        id: 'student-1',
        username: 'ada.student',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: UserRole.STUDENT,
        isActive: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
        memberships: [],
        gradeLevelId: null,
        gradeLevel: null,
        studentNumber: null,
        oen: null,
        dateOfBirth: null,
        gender: null,
        studentEmail: null,
        allergies: null,
        medicalConditions: null,
        healthCardNumber: null,
        guardian1Name: null,
        guardian1Email: null,
        guardian1Phone: null,
        guardian1Address: null,
        guardian1Relationship: null,
        guardian1WorkPhone: null,
        guardian2Name: null,
        guardian2Email: null,
        guardian2Phone: null,
        guardian2Address: null,
        guardian2Relationship: null,
        guardian2WorkPhone: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        province: null,
        postalCode: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelationship: null,
      });

    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledTimes(2);
  });

  it('updates student profile fields for owner access', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.user.update.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      studentNumber: '000123',
      oen: '123456789',
      dateOfBirth: '2014-05-06T00:00:00.000Z',
      gender: StudentGender.FEMALE,
      studentEmail: 'ada.student@example.com',
      allergies: 'Peanuts',
      medicalConditions: 'Asthma',
      healthCardNumber: '1234567890',
      guardian1Name: 'Grace Hopper',
      guardian1Email: 'grace@example.com',
      guardian1Phone: '555-0100',
      guardian1Address: '123 Main St',
      guardian1Relationship: 'Mother',
      guardian1WorkPhone: '555-0101',
      guardian2Name: 'Alan Turing',
      guardian2Email: 'alan@example.com',
      guardian2Phone: '555-0102',
      guardian2Address: '456 Queen St',
      guardian2Relationship: 'Father',
      guardian2WorkPhone: '555-0103',
      addressLine1: '123 Main St',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M1M1M1',
      emergencyContactName: 'Grace Hopper',
      emergencyContactPhone: '555-0100',
      emergencyContactRelationship: 'Aunt',
      memberships: [],
    });

    await request(app.getHttpServer())
      .patch('/students/student-1')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({
        studentNumber: '000123',
        oen: '123456789',
        dateOfBirth: '2014-05-06',
        gender: StudentGender.FEMALE,
        studentEmail: 'ada.student@example.com',
        allergies: 'Peanuts',
        medicalConditions: 'Asthma',
        healthCardNumber: '1234567890',
        guardian1Name: 'Grace Hopper',
        guardian1Email: 'grace@example.com',
        guardian1Phone: '555-0100',
        guardian1Address: '123 Main St',
        guardian1Relationship: 'Mother',
        guardian1WorkPhone: '555-0101',
        guardian2Name: 'Alan Turing',
        guardian2Email: 'alan@example.com',
        guardian2Phone: '555-0102',
        guardian2Address: '456 Queen St',
        guardian2Relationship: 'Father',
        guardian2WorkPhone: '555-0103',
        addressLine1: '123 Main St',
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M1M1M1',
        emergencyContactName: 'Grace Hopper',
        emergencyContactPhone: '555-0100',
      })
      .expect(200)
      .expect({
        id: 'student-1',
        role: UserRole.STUDENT,
        studentNumber: '000123',
        oen: '123456789',
        dateOfBirth: '2014-05-06T00:00:00.000Z',
        gender: StudentGender.FEMALE,
        studentEmail: 'ada.student@example.com',
        allergies: 'Peanuts',
        medicalConditions: 'Asthma',
        healthCardNumber: '1234567890',
        guardian1Name: 'Grace Hopper',
        guardian1Email: 'grace@example.com',
        guardian1Phone: '555-0100',
        guardian1Address: '123 Main St',
        guardian1Relationship: 'Mother',
        guardian1WorkPhone: '555-0101',
        guardian2Name: 'Alan Turing',
        guardian2Email: 'alan@example.com',
        guardian2Phone: '555-0102',
        guardian2Address: '456 Queen St',
        guardian2Relationship: 'Father',
        guardian2WorkPhone: '555-0103',
        addressLine1: '123 Main St',
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M1M1M1',
        emergencyContactName: 'Grace Hopper',
        emergencyContactPhone: '555-0100',
        emergencyContactRelationship: 'Aunt',
        memberships: [],
      });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'student-1' },
        data: expect.objectContaining({
          school: {
            connect: {
              id: 'school-1',
            },
          },
          studentNumber: '000123',
          oen: '123456789',
          dateOfBirth: new Date('2014-05-06T00:00:00.000Z'),
          gender: StudentGender.FEMALE,
          studentEmail: 'ada.student@example.com',
          allergies: 'Peanuts',
          medicalConditions: 'Asthma',
          healthCardNumber: '1234567890',
          guardian1Name: 'Grace Hopper',
          guardian1Email: 'grace@example.com',
          guardian1Phone: '555-0100',
          guardian1Address: '123 Main St',
          guardian1Relationship: 'Mother',
          guardian1WorkPhone: '555-0101',
          guardian2Name: 'Alan Turing',
          guardian2Email: 'alan@example.com',
          guardian2Phone: '555-0102',
          guardian2Address: '456 Queen St',
          guardian2Relationship: 'Father',
          guardian2WorkPhone: '555-0103',
          addressLine1: '123 Main St',
          city: 'Toronto',
          province: 'ON',
          postalCode: 'M1M1M1',
          emergencyContactName: 'Grace Hopper',
          emergencyContactPhone: '555-0100',
        }),
      }),
    );
  });

  it('returns 400 when student profile update uses an invalid gender value', async () => {
    await request(app.getHttpServer())
      .patch('/students/student-1')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({
        gender: 'OTHER',
      })
      .expect(400);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 400 when student profile update uses an invalid guardian email', async () => {
    await request(app.getHttpServer())
      .patch('/students/student-1')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({
        guardian1Email: 'not-an-email',
      })
      .expect(400);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 409 when student profile update hits schema drift on expanded fields', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.user.update.mockRejectedValue({
      code: 'P2022',
      message: 'The column `User.studentNumber` does not exist in the current database.',
      meta: {
        column: 'User.studentNumber',
      },
    });

    await request(app.getHttpServer())
      .patch('/students/student-1')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({
        allergies: 'Peanuts',
      })
      .expect(409)
      .expect({
        statusCode: 409,
        error: 'Conflict',
        message:
          'Student profile migrations are required before saving allergies. Apply the latest Prisma migrations and try again.',
      });
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

  it('returns 403 when a parent requests an unlinked student profile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.studentParentLink.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/students/student-1')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .expect(403);

    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('returns 403 when a parent requests linked parents for a student', async () => {
    await request(app.getHttpServer())
      .get('/students/student-1/parents')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .expect(403);

    expect(prisma.studentParentLink.findMany).not.toHaveBeenCalled();
  });
});
