import { Transform } from 'class-transformer';
import { LibraryItemStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { toNullableTrimmedString, toOptionalNumber } from './shared';

export class UpdateLibraryItemDto {
  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  isbn?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'lostFeeOverride must be a non-negative number with at most 2 decimal places',
  })
  lostFeeOverride?: string | null;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  totalCopies?: number;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsOptional()
  @IsInt()
  @Min(0)
  availableCopies?: number;

  @IsOptional()
  @IsEnum(LibraryItemStatus)
  status?: LibraryItemStatus;
}
