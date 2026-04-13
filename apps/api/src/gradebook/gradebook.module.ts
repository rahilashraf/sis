import { Module } from '@nestjs/common';
import { GradebookConfigController } from './gradebook-config.controller';
import { GradebookConfigService } from './gradebook-config.service';
import { GradeOverridesController } from './grade-overrides.controller';
import { GradeOverridesService } from './grade-overrides.service';
import { GradebookService } from './gradebook.service';

@Module({
  controllers: [GradebookConfigController, GradeOverridesController],
  providers: [GradebookService, GradebookConfigService, GradeOverridesService],
  exports: [GradebookService],
})
export class GradebookModule {}
