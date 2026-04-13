import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GradeLevelsController } from './grade-levels.controller';
import { GradeLevelsService } from './grade-levels.service';

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    request.user = {
      id: 'owner-1',
      role: 'OWNER',
      memberships: [{ schoolId: 'school-1', isActive: true }],
    };

    return true;
  }
}

describe('GradeLevelsController (HTTP)', () => {
  let app: INestApplication;
  let gradeLevelsService: { findAllForSchool: jest.Mock };

  beforeEach(async () => {
    gradeLevelsService = {
      findAllForSchool: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GradeLevelsController],
      providers: [
        {
          provide: GradeLevelsService,
          useValue: gradeLevelsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtAuthGuard)
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

  it('accepts includeInactive=true via the query DTO', async () => {
    await request(app.getHttpServer())
      .get('/grade-levels?schoolId=school-1&includeInactive=true')
      .expect(200)
      .expect([]);

    expect(gradeLevelsService.findAllForSchool).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'owner-1', role: 'OWNER' }),
      'school-1',
      true,
    );
  });

  it('rejects unknown query parameters under strict validation', async () => {
    await request(app.getHttpServer())
      .get('/grade-levels?schoolId=school-1&unexpected=value')
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toContain('property unexpected should not exist');
      });
  });
});
