import { Transform, Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

function toNullableTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class SubmitFormValueDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  fieldId: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  value?: string | null;
}

export class SubmitFormDto {
  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  studentId?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitFormValueDto)
  values: SubmitFormValueDto[];
}
