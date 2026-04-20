import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class GetBillingSummaryReportQueryDto {
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

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  format?: string;
}
