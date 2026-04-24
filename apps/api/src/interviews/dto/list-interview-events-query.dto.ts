import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { toOptionalBoolean, toOptionalTrimmedString } from './shared';

export class ListInterviewEventsQueryDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;

  @Transform(({ value }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

  @Transform(({ value }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  includeUnpublished?: boolean;
}
