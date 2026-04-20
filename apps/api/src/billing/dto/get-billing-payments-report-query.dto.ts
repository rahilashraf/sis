import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toOptionalBoolean(value: unknown) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function toUpperTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : undefined;
}

export class GetBillingPaymentsReportQueryDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  dateTo?: string;

  @Transform(({ value }) => toUpperTrimmedString(value))
  @IsOptional()
  @IsString()
  method?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  studentId?: string;

  @Transform(({ value }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  includeVoided?: boolean;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  format?: string;
}
