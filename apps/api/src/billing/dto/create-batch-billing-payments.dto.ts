import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { PaymentAllocationItemDto } from './create-billing-payment.dto';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.trim();
}

function toNullableTrimmedString(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePaymentMethod(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toUpperCase();

  if (
    normalized === 'E_TRANSFER' ||
    normalized === 'ETRANSFER' ||
    normalized === 'INTERAC'
  ) {
    return PaymentMethod.E_TRANSFER;
  }

  if (normalized === 'BANK_TRANSFER' || normalized === 'OTHER') {
    return PaymentMethod.EFT;
  }

  if (normalized === 'CARD_EXTERNAL' || normalized === 'CARD') {
    return PaymentMethod.DEBIT_CREDIT;
  }

  return normalized;
}

export class BatchBillingPaymentEntryDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  studentId: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolYearId?: string | null;

  @IsISO8601()
  paymentDate: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a valid decimal number',
  })
  amount: string;

  @Transform(({ value }) => normalizePaymentMethod(value))
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  referenceNumber?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationItemDto)
  allocations?: PaymentAllocationItemDto[];
}

export class CreateBatchBillingPaymentsDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @IsNotEmpty()
  schoolId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchBillingPaymentEntryDto)
  entries: BatchBillingPaymentEntryDto[];
}
