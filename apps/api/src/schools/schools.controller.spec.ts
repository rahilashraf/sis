import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';

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

describe('SchoolsController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    school: {
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      school: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchoolsController],
      providers: [
        SchoolsService,
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a school for admin-level access', async () => {
    prisma.school.create.mockResolvedValue({
      id: 'school-2',
      name: 'South School',
      shortName: 'SS',
      isActive: true,
    });

    await request(app.getHttpServer())
      .post('/schools')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({
        name: 'South School',
        shortName: 'SS',
      })
      .expect(201)
      .expect({
        id: 'school-2',
        name: 'South School',
        shortName: 'SS',
        isActive: true,
      });

    expect(prisma.school.create).toHaveBeenCalledWith({
      data: {
        memberships: {
          create: {
            userId: 'admin-1',
            isActive: true,
          },
        },
        name: 'South School',
        shortName: 'SS',
      },
    });
  });

  it('deletes an empty school for admin-level access', async () => {
    prisma.school.findUnique.mockResolvedValue({
      id: 'school-1',
      _count: {
        memberships: 0,
        schoolYears: 0,
        classes: 0,
        attendanceSessions: 0,
        reportingPeriods: 0,
      },
    });
    prisma.school.delete.mockResolvedValue({ id: 'school-1' });

    await request(app.getHttpServer())
      .delete('/schools/school-1')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-role', UserRole.OWNER)
      .expect(200)
      .expect({ success: true });
  });

  it('returns 403 for non-admin school deletion access', async () => {
    await request(app.getHttpServer())
      .delete('/schools/school-1')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(403);

    expect(prisma.school.findUnique).not.toHaveBeenCalled();
  });
});
