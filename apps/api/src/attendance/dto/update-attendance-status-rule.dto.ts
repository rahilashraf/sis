import { AttendanceStatusCountBehavior } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateAttendanceStatusRuleDto {
  @IsEnum(AttendanceStatusCountBehavior)
  behavior: AttendanceStatusCountBehavior;
}
