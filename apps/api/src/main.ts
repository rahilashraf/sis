import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AuditService } from './audit/audit.service';
import { PrismaClientExceptionFilter } from './common/filters/prisma-client-exception.filter';
import { StripSensitiveFieldsInterceptor } from './common/interceptors/strip-sensitive-fields.interceptor';

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const auditService = app.get(AuditService);
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';
  const corsOrigin = configService.get<string>('CORS_ORIGIN') ?? '';
  const corsCredentials =
    configService.get<string>('CORS_CREDENTIALS') === 'true';
  const slowRequestThresholdMs = parsePositiveInteger(
    configService.get<string>('API_SLOW_REQUEST_THRESHOLD_MS'),
    1200,
  );

  const configuredOrigins = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins =
    configuredOrigins.length > 0
      ? configuredOrigins
      : isProduction
        ? []
        : ['http://localhost:3001', 'http://localhost:3000'];

  if (isProduction && origins.length === 0) {
    throw new Error('CORS_ORIGIN must contain at least one origin in production');
  }

  if (isProduction && origins.includes('*')) {
    throw new Error('Wildcard CORS_ORIGIN is not allowed in production');
  }

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (origins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: corsCredentials,
  });
  app.use(
    helmet({
      frameguard: {
        action: 'deny',
      },
      noSniff: true,
      referrerPolicy: {
        policy: 'no-referrer',
      },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new PrismaClientExceptionFilter());
  app.useGlobalInterceptors(new StripSensitiveFieldsInterceptor());
  app.use((req, res, next) => {
    const requestStartedAt = Date.now();
    res.on('finish', () => {
      const requestPath =
        (req.originalUrl ?? req.path ?? req.url ?? '').split('?')[0] ?? '';
      const durationMs = Date.now() - requestStartedAt;
      const user = (req as { user?: { id?: string; role?: string } }).user;
      const clientIp =
        (typeof req.ip === 'string' && req.ip.trim().length > 0
          ? req.ip.trim()
          : req.socket?.remoteAddress) ?? 'unknown';

      if (res.statusCode >= 500) {
        console.error('API_REQUEST_ERROR', {
          method: req.method,
          path: requestPath,
          statusCode: res.statusCode,
          durationMs,
          userId: user?.id ?? null,
          userRole: user?.role ?? null,
        });
      }

      if (res.statusCode === 401 || res.statusCode === 403) {
        console.warn('API_AUTH_ACCESS_EVENT', {
          method: req.method,
          path: requestPath,
          statusCode: res.statusCode,
          durationMs,
          userId: user?.id ?? null,
          userRole: user?.role ?? null,
          clientIp,
        });
      }

      if (durationMs >= slowRequestThresholdMs) {
        console.warn('API_SLOW_REQUEST', {
          method: req.method,
          path: requestPath,
          statusCode: res.statusCode,
          durationMs,
          userId: user?.id ?? null,
          userRole: user?.role ?? null,
        });
      }

      if (requestPath.includes('/export') && res.statusCode >= 400) {
        console.warn('API_EXPORT_FAILURE', {
          method: req.method,
          path: requestPath,
          statusCode: res.statusCode,
          durationMs,
          userId: user?.id ?? null,
          userRole: user?.role ?? null,
        });
      }

      if (requestPath.endsWith('/auth/login') && res.statusCode === 401) {
        console.warn('AUTH_LOGIN_FAILED_EVENT', {
          method: req.method,
          path: requestPath,
          statusCode: res.statusCode,
          durationMs,
          clientIp,
        });
      }

      if (requestPath.endsWith('/auth/login') && res.statusCode === 429) {
        void auditService.logCritical({
          entityType: 'Auth',
          action: 'LOGIN_THROTTLED',
          summary: 'Login request throttled due to too many attempts',
          metadataJson: {
            method: req.method,
            path: requestPath,
          },
        });

        console.warn('AUTH_LOGIN_THROTTLED_EVENT', {
          method: req.method,
          path: requestPath,
          statusCode: res.statusCode,
          durationMs,
          clientIp,
        });
      }
    });
    next();
  });

  const port = process.env.PORT || 3000;
  console.log('API_BOOTSTRAP_LISTEN_START', {
    port,
    nodeEnv,
  });
  await app.listen(port);
  console.log('API_BOOTSTRAP_LISTEN_READY', {
    port,
    nodeEnv,
  });
}
bootstrap().catch((err) => {
  console.error('Failed to start the application:', err);
  process.exit(1);
});
