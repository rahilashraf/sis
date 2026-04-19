import { Transform } from 'class-transformer';
import {
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
  IncidentLevel,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IncidentReportDetailsDto } from './incident-report-details.dto';

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

export class UpdateBehaviorRecordDto {
  @IsOptional()
  @IsDateString()
  incidentAt?: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  categoryOptionId?: string | null;

  @IsOptional()
  @IsEnum(BehaviorSeverity)
  severity?: BehaviorSeverity;

  @IsOptional()
  @IsEnum(BehaviorRecordType)
  type?: BehaviorRecordType;

  @IsOptional()
  @IsEnum(IncidentLevel)
  incidentLevel?: IncidentLevel;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  title?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  description?: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  actionTaken?: string | null;

  @IsOptional()
  @IsBoolean()
  followUpRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  parentContacted?: boolean;

  @IsOptional()
  @IsEnum(BehaviorRecordStatus)
  status?: BehaviorRecordStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => IncidentReportDetailsDto)
  incidentReport?: IncidentReportDetailsDto;
}
