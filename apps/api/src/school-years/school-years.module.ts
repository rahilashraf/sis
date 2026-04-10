import { Module } from '@nestjs/common';
import { SchoolYearsController } from './school-years.controller';
import { SchoolYearsService } from './school-years.service';

@Module({
  controllers: [SchoolYearsController],
  providers: [SchoolYearsService],
})
export class SchoolYearsModule {}
