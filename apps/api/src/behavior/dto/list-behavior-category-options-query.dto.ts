import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return value;
}

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class ListBehaviorCategoryOptionsQueryDto {
  @Transform(({ value }) => toBoolean(value))
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;
}
