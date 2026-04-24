import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  toNullableTrimmedString,
  toTrimmedString,
} from './shared';

export class CreateInterviewSlotDto {
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
  startTime: string;

  @IsISO8601()
  endTime: string;

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
