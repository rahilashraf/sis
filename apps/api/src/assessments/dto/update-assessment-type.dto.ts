import { Type } from 'class-transformer';
import { IsOptional, IsString, Min } from 'class-validator';

export class UpdateAssessmentTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  sortOrder?: number;
}

