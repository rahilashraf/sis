import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { toTrimmedString } from './shared';

export class GetParentInterviewEventSlotsQueryDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  studentId: string;
}
