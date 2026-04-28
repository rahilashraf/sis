import { NotificationType, UserRole } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateNotificationBroadcastDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(1000)
  message!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsEnum(UserRole, { each: true })
  targetRoles?: UserRole[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  recipientUserIds?: string[];
}
