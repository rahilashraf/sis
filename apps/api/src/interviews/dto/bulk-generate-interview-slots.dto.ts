import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  toNullableTrimmedString,
  toOptionalNumber,
  toTrimmedString,
} from './shared';

export class BulkGenerateInterviewSlotsDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  interviewEventId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  teacherId: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  classId?: string | null;

  @IsISO8601()
  windowStart: string;

  @IsISO8601()
  windowEnd: string;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(5)
  @Max(240)
  slotDurationMinutes: number;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  breakMinutes?: number;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  meetingMode?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
