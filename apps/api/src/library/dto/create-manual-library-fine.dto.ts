import { Transform } from 'class-transformer';
import { LibraryFineReason } from '@prisma/client';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { toNullableTrimmedString, toTrimmedString } from './shared';

export class CreateManualLibraryFineDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  studentId: string;

  @IsOptional()
  @IsEnum(LibraryFineReason)
  reason?: LibraryFineReason;

  @IsOptional()
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a positive number with at most 2 decimal places',
  })
  amount?: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  libraryItemId?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  checkoutId?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  holdReference?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  dueDate?: string | null;
}
