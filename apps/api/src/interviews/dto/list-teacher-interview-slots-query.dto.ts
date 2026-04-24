import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { toOptionalTrimmedString } from './shared';

export class ListTeacherInterviewSlotsQueryDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  interviewEventId?: string;
}
