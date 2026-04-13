import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class CreateReRegistrationWindowDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolYearId: string;

  @IsDateString()
  opensAt: string;

  @IsDateString()
  closesAt: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

