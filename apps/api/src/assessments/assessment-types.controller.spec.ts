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
import { AssessmentTypesController } from './assessment-types.controller';
import { AssessmentTypesService } from './assessment-types.service';

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-test-user-id'];
    const role = request.headers['x-test-role'];

    request.user = {
      id: Array.isArray(userId) ? userId[0] : userId,
      role: Array.isArray(role) ? role[0] : role,
      memberships: [],
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

describe('AssessmentTypesController (HTTP)', () => {
  let app: INestApplication;
  let prisma: {
    assessmentType: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      assessmentType: { findMany: jest.fn() },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AssessmentTypesController],
      providers: [
        AssessmentTypesService,
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

  it('returns [] when the AssessmentType table/column is missing (no 500)', async () => {
    prisma.assessmentType.findMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing table', {
        code: 'P2021',
        clientVersion: 'test',
      }),
    );

    await request(app.getHttpServer())
      .get('/assessment-types')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect([]);
  });

  it('parses includeInactive=true and does not filter to active types only', async () => {
    prisma.assessmentType.findMany.mockResolvedValue([{ id: 'type-1' }]);

    await request(app.getHttpServer())
      .get('/assessment-types?includeInactive=true')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(200)
      .expect([{ id: 'type-1' }]);

    expect(prisma.assessmentType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ isActive: true }),
      }),
    );
  });

  it('returns 400 when includeInactive is not a boolean', async () => {
    await request(app.getHttpServer())
      .get('/assessment-types?includeInactive=maybe')
      .set('x-test-user-id', 'teacher-1')
      .set('x-test-role', UserRole.TEACHER)
      .expect(400);
  });

  it('blocks admins from creating assessment types (owner/super-admin only)', async () => {
    await request(app.getHttpServer())
      .post('/assessment-types')
      .set('x-test-user-id', 'admin-1')
      .set('x-test-role', UserRole.ADMIN)
      .send({ name: 'Quiz', schoolId: 'school-1' })
      .expect(403);
  });
});
