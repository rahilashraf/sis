import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaClientExceptionFilter } from './common/filters/prisma-client-exception.filter';
import { StripSensitiveFieldsInterceptor } from './common/interceptors/strip-sensitive-fields.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  const corsCredentials =
    configService.get<string>('CORS_CREDENTIALS') === 'true';

  if (corsOrigin) {
    const origins = corsOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    app.enableCors({
      origin: origins.length === 1 ? origins[0] : origins,
      credentials: corsCredentials,
    });
  }

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

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
