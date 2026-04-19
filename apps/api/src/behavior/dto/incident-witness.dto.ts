import { Transform } from 'class-transformer';
import { IncidentWitnessRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

function toNullableTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class IncidentWitnessDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  name: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  phoneNumber?: string | null;

  @IsOptional()
  @IsEnum(IncidentWitnessRole)
  role?: IncidentWitnessRole;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  notes?: string | null;
}
