import { AttendanceStatusCountBehavior } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateAttendanceCustomStatusDto {
  @IsString()
  schoolId: string;

  @IsString()
  label: string;

  @IsEnum(AttendanceStatusCountBehavior)
  behavior: AttendanceStatusCountBehavior;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
