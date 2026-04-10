import { Module } from '@nestjs/common';
import { ReportingPeriodsController } from './reporting-periods.controller';
import { ReportingPeriodsService } from './reporting-periods.service';

@Module({
  controllers: [ReportingPeriodsController],
  providers: [ReportingPeriodsService],
})
export class ReportingPeriodsModule {}
