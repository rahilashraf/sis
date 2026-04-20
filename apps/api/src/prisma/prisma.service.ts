import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is not set in apps/api/.env');
    }

    const adapter = new PrismaPg({ connectionString });

    super({
      adapter,
    });
  }

  private getSafeDatabaseTarget(connectionString: string) {
    try {
      const parsed = new URL(connectionString);

      return {
        host: parsed.hostname || null,
        database: parsed.pathname
          ? parsed.pathname.replace(/^\//, '') || null
          : null,
      };
    } catch {
      return {
        host: null,
        database: null,
      };
    }
  }

  async onModuleInit() {
    const envName = process.env.NODE_ENV ?? 'unknown';
    const safeDbTarget = this.getSafeDatabaseTarget(
      process.env.DATABASE_URL ?? '',
    );

    await this.$connect();

    this.logger.log({
      event: 'PRISMA_CONNECTED',
      environment: envName,
      host: safeDbTarget.host,
      database: safeDbTarget.database,
      connected: true,
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
