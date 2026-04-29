import { Transform, Type } from 'class-transformer';
import {
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
  IncidentLevel,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class ListBehaviorRecordsQueryDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsEnum(BehaviorRecordType)
  type?: BehaviorRecordType;

  @IsOptional()
  @IsEnum(BehaviorRecordStatus)
  status?: BehaviorRecordStatus;

  @IsOptional()
  @IsEnum(BehaviorSeverity)
  severity?: BehaviorSeverity;

  @IsOptional()
  @IsEnum(IncidentLevel)
  incidentLevel?: IncidentLevel;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
