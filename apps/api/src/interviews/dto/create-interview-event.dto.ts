import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  toNullableTrimmedString,
  toTrimmedString,
} from './shared';

export class CreateInterviewEventDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @MaxLength(200)
  title: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsISO8601()
  bookingOpensAt?: string;

  @IsOptional()
  @IsISO8601()
  bookingClosesAt?: string;

  @IsISO8601()
  startsAt: string;

  @IsISO8601()
  endsAt: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
