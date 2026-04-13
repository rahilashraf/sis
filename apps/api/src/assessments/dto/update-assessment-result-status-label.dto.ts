import { Transform, Type } from 'class-transformer';
import { ResultCalculationBehavior } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class UpdateAssessmentResultStatusLabelDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsEnum(ResultCalculationBehavior)
  behavior?: ResultCalculationBehavior;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

