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
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { GradebookService } from '../gradebook/gradebook.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const schoolIdsHeader = request.headers['x-test-school-ids'];
    const primarySchoolIdHeader = request.headers['x-test-primary-school-id'];
    const schoolIdsRaw = Array.isArray(schoolIdsHeader)
      ? schoolIdsHeader[0]
      : schoolIdsHeader;
    const schoolIds =
      typeof schoolIdsRaw === 'string'
        ? schoolIdsRaw
            .split(',')
            .map((entry: string) => entry.trim())
            .filter(Boolean)
        : [];
    const primarySchoolId = Array.isArray(primarySchoolIdHeader)
      ? primarySchoolIdHeader[0]
      : primarySchoolIdHeader;

    request.user = {
      id: request.headers['x-test-user-id'],
      role: request.headers['x-test-role'],
      schoolId: typeof primarySchoolId === 'string' ? primarySchoolId : undefined,
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

describe('ClassesController (HTTP)', () => {
  let app: INestApplication;
  let gradebook: { getClassSummary: jest.Mock };
  let prisma: {
    class: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    user: { findMany: jest.Mock };
    teacherClassAssignment: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
    studentClassEnrollment: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
      create: jest.Mock;
    };
    timetableBlockClass: { findMany: jest.Mock };
    studentParentLink: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    gradebook = {
      getClassSummary: jest.fn(),
    };

    prisma = {
      class: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      user: { findMany: jest.fn() },
      teacherClassAssignment: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      studentClassEnrollment: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
        create: jest.fn(),
      },
      timetableBlockClass: { findMany: jest.fn() },
      studentParentLink: { findUnique: jest.fn() },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ClassesController],
      providers: [
        ClassesService,
        {
          provide: GradebookService,
          useValue: gradebook,
        },
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

  it('returns all classes for admin-like access', async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        name: 'Math',
      },
    ]);

    await request(app.getHttpServer())
      .get('/classes')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .set('x-test-school-ids', 'school-1')
      .expect(200)
      .expect([
        {
          id: 'class-1',
          name: 'Math',
        },
      ]);

    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: {
            in: ['school-1'],
          },
        }),
      }),
    );
  });

  it('returns 403 when a teacher requests all classes directly', async () => {
    await request(app.getHttpServer())
      .get('/classes')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });

  it('routes /classes/my to the teacher assigned-classes handler instead of the :id route', async () => {
    prisma.teacherClassAssignment.findMany.mockResolvedValue([
      { class: { id: 'class-1', name: 'Math' } },
      { class: { id: 'class-2', name: 'Science' } },
    ]);

    await request(app.getHttpServer())
      .get('/classes/my')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .set('x-test-school-ids', 'school-1,school-2')
      .expect(200)
      .expect([
        { id: 'class-1', name: 'Math' },
        { id: 'class-2', name: 'Science' },
      ]);

    expect(prisma.class.findUnique).not.toHaveBeenCalled();
  });

  it('scopes class listing to all assigned schools for multi-school staff users', async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/classes')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .set('x-test-school-ids', 'school-1,school-2')
      .expect(200);

    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: {
            in: ['school-1', 'school-2'],
          },
        }),
      }),
    );
  });

  it('falls back to legacy user.schoolId when memberships are missing for staff users', async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/classes')
      .set('x-test-user-id', 'legacy-staff-1')
      .set('x-test-role', UserRole.STAFF)
      .set('x-test-primary-school-id', 'school-legacy')
      .expect(200);

    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: {
            in: ['school-legacy'],
          },
        }),
      }),
    );
  });

  it('returns class students for an assigned teacher', async () => {
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
    });
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { id: 'enrollment-1', student: { id: 'student-1', firstName: 'Ada' } },
    ]);

    await request(app.getHttpServer())
      .get('/classes/class-1/students')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect([
        { id: 'enrollment-1', student: { id: 'student-1', firstName: 'Ada' } },
      ]);
  });

  it('returns 403 when an unassigned teacher requests class students', async () => {
    prisma.teacherClassAssignment.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/classes/class-1/students')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.studentClassEnrollment.findMany).not.toHaveBeenCalled();
  });

  it('returns teacher classes for self access', async () => {
    prisma.teacherClassAssignment.findMany.mockResolvedValue([
      { class: { id: 'class-1', name: 'Math' } },
    ]);

    await request(app.getHttpServer())
      .get('/classes/teacher/teacher-1')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect([{ class: { id: 'class-1', name: 'Math' } }]);
  });

  it('returns 403 when a teacher requests another teacher classes', async () => {
    await request(app.getHttpServer())
      .get('/classes/teacher/teacher-2')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.teacherClassAssignment.findMany).not.toHaveBeenCalled();
  });

  it('returns student classes for self access', async () => {
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { class: { id: 'class-1', name: 'Math' } },
    ]);

    await request(app.getHttpServer())
      .get('/classes/student/student-1')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .expect(200)
      .expect([{ class: { id: 'class-1', name: 'Math' } }]);
  });

  it('returns 403 when a student requests another student classes', async () => {
    await request(app.getHttpServer())
      .get('/classes/student/student-2')
      .set('x-test-user-id', 'student-1')
      .set('x-test-role', UserRole.STUDENT)
      .expect(403);

    expect(prisma.studentClassEnrollment.findMany).not.toHaveBeenCalled();
  });

  it('returns student classes for a linked parent', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue({ id: 'link-1' });
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      { class: { id: 'class-1', name: 'Math' } },
    ]);

    await request(app.getHttpServer())
      .get('/classes/student/student-1')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .expect(200)
      .expect([{ class: { id: 'class-1', name: 'Math' } }]);
  });

  it('returns 403 when a parent requests an unlinked student classes', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/classes/student/student-1')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .expect(403);

    expect(prisma.studentClassEnrollment.findMany).not.toHaveBeenCalled();
  });

  it('removes a teacher from a class for admin access', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
    });
    prisma.teacherClassAssignment.delete.mockResolvedValue({
      id: 'assignment-1',
      teacher: { id: 'teacher-1', firstName: 'Ada' },
      class: { id: 'class-1', name: 'Math' },
    });

    await request(app.getHttpServer())
      .delete('/classes/class-1/teachers/teacher-1')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .set('x-test-school-ids', 'school-1')
      .expect(200)
      .expect({
        id: 'assignment-1',
        teacher: { id: 'teacher-1', firstName: 'Ada' },
        class: { id: 'class-1', name: 'Math' },
      });
  });

  it('returns 403 when a teacher tries to remove a teacher from a class', async () => {
    await request(app.getHttpServer())
      .delete('/classes/class-1/teachers/teacher-1')
      .set('x-test-user-id', 'teacher-2')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.teacherClassAssignment.delete).not.toHaveBeenCalled();
  });

  it('unenrolls a student from a class for admin access', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({
      id: 'enrollment-1',
    });
    prisma.studentClassEnrollment.delete.mockResolvedValue({
      id: 'enrollment-1',
      student: { id: 'student-1', firstName: 'Ada' },
      class: { id: 'class-1', name: 'Math' },
    });

    await request(app.getHttpServer())
      .delete('/classes/class-1/students/student-1')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .set('x-test-school-ids', 'school-1')
      .expect(200)
      .expect({
        id: 'enrollment-1',
        student: { id: 'student-1', firstName: 'Ada' },
        class: { id: 'class-1', name: 'Math' },
      });
  });

  it('returns 403 when a teacher tries to unenroll a student from a class', async () => {
    await request(app.getHttpServer())
      .delete('/classes/class-1/students/student-1')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.studentClassEnrollment.delete).not.toHaveBeenCalled();
  });

  it('bulk enrolls one student into multiple classes for admin access', async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        name: 'Math',
        isActive: true,
      },
      {
        id: 'class-2',
        schoolId: 'school-1',
        schoolYearId: 'year-1',
        name: 'Science',
        isActive: true,
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'student-1',
        role: UserRole.STUDENT,
        isActive: true,
        schoolId: 'school-1',
        memberships: [{ schoolId: 'school-1' }],
      },
    ]);
    prisma.studentClassEnrollment.findMany.mockResolvedValue([]);
    prisma.studentClassEnrollment.create
      .mockResolvedValueOnce({
        id: 'enrollment-1',
        classId: 'class-1',
        studentId: 'student-1',
        createdAt: new Date().toISOString(),
        student: { firstName: 'Ada', lastName: 'Lovelace' },
        class: { schoolId: 'school-1', name: 'Math' },
      })
      .mockResolvedValueOnce({
        id: 'enrollment-2',
        classId: 'class-2',
        studentId: 'student-1',
        createdAt: new Date().toISOString(),
        student: { firstName: 'Ada', lastName: 'Lovelace' },
        class: { schoolId: 'school-1', name: 'Science' },
      });
    prisma.timetableBlockClass.findMany.mockResolvedValue([]);

    const response = await request(app.getHttpServer())
      .post('/classes/bulk-enroll')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .set('x-test-school-ids', 'school-1')
      .send({
        studentId: 'student-1',
        classIds: ['class-1', 'class-2'],
      })
      .expect(201);

    expect(response.body.success).toHaveLength(2);
    expect(response.body.skipped).toEqual([]);
    expect(response.body.failed).toEqual([]);
  });

  it('returns 403 when staff attempts bulk enrollment endpoint', async () => {
    await request(app.getHttpServer())
      .post('/classes/class-1/bulk-enroll-students')
      .set('x-test-user-id', 'staff-1')
      .set('x-test-role', UserRole.STAFF)
      .send({ studentIds: ['student-1'] })
      .expect(403);
  });

  it('archives a class for admin access', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.class.update.mockResolvedValue({
      id: 'class-1',
      name: 'Math',
      isActive: false,
      school: { id: 'school-1' },
      schoolYear: { id: 'year-1' },
      teachers: [],
      students: [],
    });

    await request(app.getHttpServer())
      .patch('/classes/class-1/archive')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .set('x-test-school-ids', 'school-1')
      .expect(200)
      .expect({
        id: 'class-1',
        name: 'Math',
        isActive: false,
        school: { id: 'school-1' },
        schoolYear: { id: 'year-1' },
        teachers: [],
        students: [],
      });
  });

  it('reactivates a class for admin access', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.class.update.mockResolvedValue({
      id: 'class-1',
      name: 'Math',
      isActive: true,
      school: { id: 'school-1' },
      schoolYear: { id: 'year-1' },
      teachers: [],
      students: [],
    });

    await request(app.getHttpServer())
      .patch('/classes/class-1/reactivate')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .set('x-test-school-ids', 'school-1')
      .expect(200)
      .expect({
        id: 'class-1',
        name: 'Math',
        isActive: true,
        school: { id: 'school-1' },
        schoolYear: { id: 'year-1' },
        teachers: [],
        students: [],
      });
  });

  it('returns 403 when a teacher tries to archive a class', async () => {
    await request(app.getHttpServer())
      .patch('/classes/class-1/archive')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('returns 403 when a teacher tries to duplicate a class', async () => {
    await request(app.getHttpServer())
      .post('/classes/class-1/duplicate')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        targetSchoolId: 'school-1',
        targetSchoolYearId: 'year-1',
      })
      .expect(403);
  });

  it('returns 403 when a teacher tries to copy gradebook settings', async () => {
    await request(app.getHttpServer())
      .post('/classes/class-1/copy-gradebook-settings')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .send({
        targetClassId: 'class-2',
      })
      .expect(403);
  });
});
