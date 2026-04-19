import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

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

export class CreateBehaviorCategoryOptionDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  name: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string | null;

  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
