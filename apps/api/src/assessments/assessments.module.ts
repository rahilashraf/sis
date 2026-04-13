import { Module } from '@nestjs/common';
import { AssessmentTypesController } from './assessment-types.controller';
import { AssessmentTypesService } from './assessment-types.service';
import { AssessmentResultStatusLabelsController } from './assessment-result-status-labels.controller';
import { AssessmentResultStatusLabelsService } from './assessment-result-status-labels.service';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  controllers: [
    AssessmentsController,
    AssessmentTypesController,
    AssessmentResultStatusLabelsController,
  ],
  providers: [
    AssessmentsService,
    AssessmentTypesService,
    AssessmentResultStatusLabelsService,
  ],
})
export class AssessmentsModule {}
