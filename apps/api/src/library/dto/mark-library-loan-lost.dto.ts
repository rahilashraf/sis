import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { toNullableTrimmedString } from './shared';

export class MarkLibraryLoanLostDto {
  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  dueDate?: string | null;
}
