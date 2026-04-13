import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { AttendanceScopeType, AttendanceStatus } from '@prisma/client';

class CreateAttendanceRecordDto {
  @IsString()
  studentId: string;

  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsOptional()
  @IsString()
  customStatusId?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreateAttendanceDto {
  @IsString()
  schoolId: string;

  @IsOptional()
  @IsString()
  schoolYearId?: string;

  @IsDateString()
  date: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  classIds: string[];

  @IsOptional()
  @IsEnum(AttendanceScopeType)
  scopeType?: AttendanceScopeType;

  @IsOptional()
  @IsString()
  scopeLabel?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateAttendanceRecordDto)
  records: CreateAttendanceRecordDto[];
}
