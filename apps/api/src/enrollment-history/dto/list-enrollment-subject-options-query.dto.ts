import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

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

export class ListEnrollmentSubjectOptionsQueryDto {
  @Transform(({ value }) => toBoolean(value))
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;
}
