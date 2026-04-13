import { Type } from 'class-transformer';
import { IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateGradeScaleRuleDto {
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  minPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  maxPercent?: number;

  @IsOptional()
  @IsString()
  letterGrade?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  sortOrder?: number;
}

