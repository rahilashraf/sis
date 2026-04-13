import { Type } from 'class-transformer';
import { IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateGradeScaleRuleDto {
  @Type(() => Number)
  @Min(0)
  @Max(100)
  minPercent: number;

  @Type(() => Number)
  @Min(0)
  @Max(100)
  maxPercent: number;

  @IsString()
  letterGrade: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  sortOrder?: number;
}

