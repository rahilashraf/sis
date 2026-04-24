import { Transform } from 'class-transformer';
import { LibraryFineReason, LibraryFineStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { toOptionalTrimmedString } from './shared';

export class ListLibraryFinesQueryDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsEnum(LibraryFineStatus)
  status?: LibraryFineStatus;

  @IsOptional()
  @IsEnum(LibraryFineReason)
  reason?: LibraryFineReason;
}
