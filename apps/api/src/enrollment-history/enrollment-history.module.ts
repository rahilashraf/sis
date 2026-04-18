import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EnrollmentHistoryController } from './enrollment-history.controller';
import { EnrollmentHistoryService } from './enrollment-history.service';

@Module({
  imports: [PrismaModule],
  controllers: [EnrollmentHistoryController],
  providers: [EnrollmentHistoryService],
  exports: [EnrollmentHistoryService],
})
export class EnrollmentHistoryModule {}
