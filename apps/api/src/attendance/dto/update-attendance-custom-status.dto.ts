import { AttendanceStatusCountBehavior } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateAttendanceCustomStatusDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsEnum(AttendanceStatusCountBehavior)
  behavior?: AttendanceStatusCountBehavior;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
