import { Transform, Type } from 'class-transformer';
import { ResultCalculationBehavior } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsInt } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class CreateAssessmentResultStatusLabelDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  key?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  label: string;

  @IsOptional()
  @IsEnum(ResultCalculationBehavior)
  behavior?: ResultCalculationBehavior;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}
