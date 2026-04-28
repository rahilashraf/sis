import { NotificationType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const studentAlertTypes = [
  NotificationType.FORM_REMINDER,
  NotificationType.ATTENDANCE_ALERT,
  NotificationType.LOW_GRADE_ALERT,
  NotificationType.NEW_PUBLISHED_GRADE,
] as const;

export class CreateStudentNotificationAlertDto {
  @IsString()
  studentId!: string;

  @IsEnum(studentAlertTypes)
  type!: (typeof studentAlertTypes)[number];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsBoolean()
  includeStudent?: boolean;

  @IsOptional()
  @IsBoolean()
  includeParents?: boolean;
}
