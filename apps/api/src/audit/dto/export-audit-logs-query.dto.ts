import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AuditLogSeverity } from '@prisma/client';

export class ExportAuditLogsQueryDto {
  @IsString()
  fromDate: string;

  @IsString()
  toDate: string;

  @IsOptional()
  @IsString()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsEnum(AuditLogSeverity)
  severity?: AuditLogSeverity;
}
