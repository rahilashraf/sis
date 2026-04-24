import { Transform } from 'class-transformer';
import { InterviewSlotStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import {
  toOptionalBoolean,
  toOptionalTrimmedString,
} from './shared';

export class ListInterviewSlotsQueryDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  interviewEventId?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsEnum(InterviewSlotStatus)
  status?: InterviewSlotStatus;

  @Transform(({ value }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  booked?: boolean;
}
