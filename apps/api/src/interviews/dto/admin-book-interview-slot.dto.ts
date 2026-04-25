import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  toNullableTrimmedString,
  toTrimmedString,
} from './shared';

export class AdminBookInterviewSlotDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  studentId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  parentId: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bookingNotes?: string | null;
}
