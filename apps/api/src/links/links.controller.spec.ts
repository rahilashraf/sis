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
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

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

describe('LinksController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    user: { findUnique: jest.Mock };
    studentParentLink: {
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      studentParentLink: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinksController],
      providers: [
        LinksService,
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

    app = module.createNestApplication();
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

  it('creates a student-parent link for owner access', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'parent-1',
        role: UserRole.PARENT,
        memberships: [{ schoolId: 'school-1' }],
      })
      .mockResolvedValueOnce({
        id: 'student-1',
        role: UserRole.STUDENT,
        memberships: [{ schoolId: 'school-1' }],
      });
    prisma.studentParentLink.create.mockResolvedValue({
      id: 'link-1',
      parentId: 'parent-1',
      studentId: 'student-1',
      createdAt: '2026-04-11T00:00:00.000Z',
      updatedAt: '2026-04-11T00:00:00.000Z',
      parent: { id: 'parent-1', role: UserRole.PARENT },
      student: { id: 'student-1', role: UserRole.STUDENT },
    });

    await request(app.getHttpServer())
      .post('/student-parent-links')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({
        parentId: 'parent-1',
        studentId: 'student-1',
      })
      .expect(201)
      .expect({
        id: 'link-1',
        parentId: 'parent-1',
        studentId: 'student-1',
        createdAt: '2026-04-11T00:00:00.000Z',
        updatedAt: '2026-04-11T00:00:00.000Z',
        parent: { id: 'parent-1', role: UserRole.PARENT },
        student: { id: 'student-1', role: UserRole.STUDENT },
      });
  });

  it('returns 409 when a duplicate student-parent link is created', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'parent-1',
        role: UserRole.PARENT,
        memberships: [{ schoolId: 'school-1' }],
      })
      .mockResolvedValueOnce({
        id: 'student-1',
        role: UserRole.STUDENT,
        memberships: [{ schoolId: 'school-1' }],
      });
    prisma.studentParentLink.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate link', {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          target: ['parentId', 'studentId'],
        },
      }),
    );

    await request(app.getHttpServer())
      .post('/student-parent-links')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({
        parentId: 'parent-1',
        studentId: 'student-1',
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.message).toBe('Student is already linked to this parent');
      });
  });

  it('deletes a student-parent link for owner access', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue({
      id: 'link-1',
      parent: { memberships: [] },
      student: { memberships: [] },
    });
    prisma.studentParentLink.delete.mockResolvedValue({
      id: 'link-1',
      parentId: 'parent-1',
      studentId: 'student-1',
      createdAt: '2026-04-11T00:00:00.000Z',
      updatedAt: '2026-04-11T00:00:00.000Z',
    });

    await request(app.getHttpServer())
      .delete('/student-parent-links/link-1')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .expect(200)
      .expect({
        id: 'link-1',
        parentId: 'parent-1',
        studentId: 'student-1',
        createdAt: '2026-04-11T00:00:00.000Z',
        updatedAt: '2026-04-11T00:00:00.000Z',
      });
  });

  it('returns 403 when a parent attempts to create a student-parent link', async () => {
    await request(app.getHttpServer())
      .post('/student-parent-links')
      .set('x-test-user-id', 'parent-1')
      .set('x-test-role', UserRole.PARENT)
      .send({
        parentId: 'parent-1',
        studentId: 'student-1',
      })
      .expect(403);

    expect(prisma.studentParentLink.create).not.toHaveBeenCalled();
  });

  it('returns 400 when parentId and studentId are the same user', async () => {
    await request(app.getHttpServer())
      .post('/student-parent-links')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({
        parentId: 'user-1',
        studentId: 'user-1',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe(
          'parentId and studentId must refer to different users',
        );
      });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.studentParentLink.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the parent has no active school memberships', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'parent-1',
        role: UserRole.PARENT,
        memberships: [],
      })
      .mockResolvedValueOnce({
        id: 'student-1',
        role: UserRole.STUDENT,
        memberships: [{ schoolId: 'school-1' }],
      });

    await request(app.getHttpServer())
      .post('/student-parent-links')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .send({
        parentId: 'parent-1',
        studentId: 'student-1',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe(
          'parentId must belong to a parent with an active school membership',
        );
      });

    expect(prisma.studentParentLink.create).not.toHaveBeenCalled();
  });
});
