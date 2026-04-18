import { Transform } from 'class-transformer';
import { EnrollmentHistoryStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

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

export class UpdateEnrollmentHistoryDto {
  @IsOptional()
  @IsDateString()
  dateOfEnrollment?: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsDateString()
  dateOfDeparture?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  previousSchoolName?: string | null;

  @IsOptional()
  @IsEnum(EnrollmentHistoryStatus)
  status?: EnrollmentHistoryStatus;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  notes?: string | null;
}
