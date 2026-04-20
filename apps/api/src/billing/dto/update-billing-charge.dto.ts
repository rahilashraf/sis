import { Transform } from 'class-transformer';
import { IsNumberString, IsOptional, IsString, Matches } from 'class-validator';

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

export class UpdateBillingChargeDto {
  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  title?: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  /**
   * Decimal amount as a string, e.g. "12.50".
   * Only allowed when amountPaid == 0 (no payments recorded).
   */
  @IsOptional()
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a positive number with at most 2 decimal places',
  })
  amount?: string;

  /**
   * ISO 8601 date string, e.g. "2026-06-01". Pass null to clear.
   */
  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  dueDate?: string | null;
}
