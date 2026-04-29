import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';

@Module({
  imports: [AuditModule],
  controllers: [DataImportController],
  providers: [DataImportService],
})
export class DataImportModule {}
