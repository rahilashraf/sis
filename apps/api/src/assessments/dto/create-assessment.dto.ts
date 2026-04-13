import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreateAssessmentDto {
  @IsString()
  classId: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  title: string;

  @IsString()
  assessmentTypeId: string;

  @Type(() => Number)
  @IsPositive()
  maxScore: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  reportingPeriodId?: string;

  @IsOptional()
  @IsBoolean()
  isPublishedToParents?: boolean;
}
