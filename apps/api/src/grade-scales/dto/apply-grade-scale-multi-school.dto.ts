import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

function toTrimmedStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
    .filter((entry) => typeof entry === 'string' && entry.length > 0);
}

export class ApplyGradeScaleMultiSchoolDto {
  @Transform(({ value }) => toTrimmedStringArray(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targetSchoolIds: string[];

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  sourceGradeScaleId?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  copyRules?: boolean;
}
