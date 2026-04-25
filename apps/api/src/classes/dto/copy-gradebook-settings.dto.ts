import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class CopyGradebookSettingsDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  targetClassId: string;

  @IsOptional()
  @IsBoolean()
  copyAssessmentCategories?: boolean;
}
