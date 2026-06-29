import { AnnouncementAudience } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  toNullableDateTimeString,
  toOptionalBoolean,
  toOptionalStringArray,
  toOptionalTrimmedString,
} from './shared';

export class UpdateAnnouncementDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  body?: string;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @Transform(({ value }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @Transform(({ value }) => toNullableDateTimeString(value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  expiresAt?: string | null;

  @Transform(({ value }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  includeWholeSchool?: boolean;

  @Transform(({ value }) => toOptionalStringArray(value))
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  gradeLevelIds?: string[];

  @Transform(({ value }) => toOptionalStringArray(value))
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  classIds?: string[];

  @Transform(({ value }) => toOptionalStringArray(value))
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  studentIds?: string[];
}
