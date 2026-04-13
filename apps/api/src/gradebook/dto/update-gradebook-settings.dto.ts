import { Transform } from 'class-transformer';
import { GradebookWeightingMode } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class UpdateGradebookSettingsDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsEnum(GradebookWeightingMode)
  weightingMode?: GradebookWeightingMode;
}

