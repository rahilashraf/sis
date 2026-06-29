import { AnnouncementAudience } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  toOptionalBoolean,
  toOptionalNumber,
  toOptionalTrimmedString,
} from './shared';

export enum AnnouncementStatusFilter {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  ALL = 'ALL',
}

export class ListAnnouncementsQueryDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  classId?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  gradeLevelId?: string;

  @Transform(({ value }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsEnum(AnnouncementStatusFilter)
  status?: AnnouncementStatusFilter;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
