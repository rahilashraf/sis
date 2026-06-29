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
} from 'class-validator';
import {
  toOptionalBoolean,
  toOptionalDateTimeString,
  toOptionalStringArray,
  toOptionalTrimmedString,
  toTrimmedString,
} from './shared';

export class CreateAnnouncementDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsEnum(AnnouncementAudience)
  audience!: AnnouncementAudience;

  @Transform(({ value }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @Transform(({ value }) => toOptionalDateTimeString(value))
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

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
