import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

function toNullableTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return typeof value === 'number' ? value : Number(value);
}

export class UpsertAssessmentGradeDto {
  @IsString()
  studentId: string;

  @Transform(({ value }) => toNullableNumber(value))
  @IsOptional()
  @IsNumber()
  @Min(0)
  score?: number | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  statusLabelId?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  statusLabelKey?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  comment?: string | null;

  @IsOptional()
  @IsBoolean()
  clear?: boolean;
}

export class UpsertAssessmentGradesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertAssessmentGradeDto)
  grades: UpsertAssessmentGradeDto[];
}
