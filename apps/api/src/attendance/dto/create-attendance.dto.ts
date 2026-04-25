import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ArrayMinSize,
} from 'class-validator';
import { AttendanceScopeType, AttendanceStatus } from '@prisma/client';

export class CreateAttendanceRecordDto {
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
  @ArrayMinSize(1)
  @IsString({ each: true })
  classIds: string[];

  @IsArray()
  @ArrayMinSize(1)
  records: CreateAttendanceRecordDto[];
}
