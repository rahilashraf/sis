import { Transform } from 'class-transformer';
import { LibraryHoldStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { toNullableTrimmedString } from './shared';

export class UpdateLibraryHoldDto {
  @IsEnum(LibraryHoldStatus)
  status: LibraryHoldStatus;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
