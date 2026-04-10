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

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    request.user = {
      id: request.headers['x-test-user-id'],
      role: request.headers['x-test-role'],
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
  let prisma: {
    class: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    teacherClassAssignment: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
    studentClassEnrollment: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
    studentParentLink: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      class: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      teacherClassAssignment: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      studentClassEnrollment: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      studentParentLink: { findUnique: jest.fn() },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ClassesController],
      providers: [
        ClassesService,
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
      .expect(200)
      .expect([
        {
          id: 'class-1',
          name: 'Math',
        },
      ]);
  });

  it('returns 403 when a teacher requests all classes directly', async () => {
    await request(app.getHttpServer())
      .get('/classes')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.class.findMany).not.toHaveBeenCalled();
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

  it('archives a class for admin access', async () => {
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
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
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
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
});
