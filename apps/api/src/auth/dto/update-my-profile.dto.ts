import { Transform } from 'class-transformer';
import { IsOptional, IsString, MinLength } from 'class-validator';

function toOptionalTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class UpdateMyProfileDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;
}
