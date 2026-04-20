import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { toOptionalTrimmedString, toTrimmedString } from './shared';

export class CheckoutLibraryLoanDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  itemId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  studentId: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  checkoutDate?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  dueDate: string;
}
