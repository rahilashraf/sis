import { Transform } from 'class-transformer';
import { LibraryItemStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { toOptionalTrimmedString } from './shared';

export class ListLibraryItemsQueryDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  search?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  category?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsEnum(LibraryItemStatus)
  status?: LibraryItemStatus;
}
