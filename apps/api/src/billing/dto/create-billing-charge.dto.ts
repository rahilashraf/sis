import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ChargeSourceType } from '@prisma/client';

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

export class CreateBillingChargeDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolYearId?: string | null;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  studentId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  categoryId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  title: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  /**
   * Decimal amount as a string, e.g. "12.50"
   */
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a positive number with at most 2 decimal places',
  })
  amount: string;

  /**
   * ISO 8601 date string, e.g. "2026-06-01"
   */
  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @IsEnum(ChargeSourceType)
  sourceType?: ChargeSourceType;
}
