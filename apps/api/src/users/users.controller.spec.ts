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
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

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

describe('UsersController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
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

  it('returns users for admin access', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        username: 'admin',
        memberships: [],
      },
    ]);

    await request(app.getHttpServer())
      .get('/users')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .expect(200)
      .expect([
        {
          id: 'user-1',
          username: 'admin',
          memberships: [],
        },
      ]);
  });

  it('returns 403 for non-admin user directory access', async () => {
    await request(app.getHttpServer())
      .get('/users')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('deletes a user for admin-level access', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-2',
        role: UserRole.TEACHER,
        memberships: [],
        _count: {
          parentLinks: 0,
          studentLinks: 0,
          teacherClasses: 0,
          studentClasses: 0,
          takenAttendanceSessions: 0,
          attendanceRecords: 0,
          studentGradeRecords: 0,
        },
      })
      .mockResolvedValueOnce({
        id: 'user-2',
        role: UserRole.TEACHER,
        memberships: [],
      });
    prisma.user.delete.mockResolvedValue({ id: 'user-2' });

    await request(app.getHttpServer())
      .delete('/users/user-2')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .expect(200)
      .expect({ success: true });
  });

  it('returns 403 for non-admin user deletion access', async () => {
    await request(app.getHttpServer())
      .delete('/users/user-2')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
