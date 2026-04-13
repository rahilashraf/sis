import { Module } from '@nestjs/common';
import { GradeScalesController } from './grade-scales.controller';
import { GradeScalesService } from './grade-scales.service';

@Module({
  controllers: [GradeScalesController],
  providers: [GradeScalesService],
  exports: [GradeScalesService],
})
export class GradeScalesModule {}

