import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { toNullableTrimmedString, toTrimmedString } from './shared';

export class AssessUnclaimedHoldFineDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  studentId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  holdReference: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  libraryItemId?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  dueDate?: string | null;
}
