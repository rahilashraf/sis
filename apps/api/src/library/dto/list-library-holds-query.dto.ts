import { Transform } from 'class-transformer';
import { LibraryHoldStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { toOptionalTrimmedString } from './shared';

export class ListLibraryHoldsQueryDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  studentId?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsEnum(LibraryHoldStatus)
  status?: LibraryHoldStatus;
}
