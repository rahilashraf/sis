import { Module } from '@nestjs/common';
import { GradeLevelsController } from './grade-levels.controller';
import { GradeLevelsService } from './grade-levels.service';

@Module({
  controllers: [GradeLevelsController],
  providers: [GradeLevelsService],
})
export class GradeLevelsModule {}
