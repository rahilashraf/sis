import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class ListReRegistrationTrackingDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  submissionStatus?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  returningIntent?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  reason?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  gradeLevelId?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  classId?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  query?: string;
}
