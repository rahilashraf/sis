import { Type } from 'class-transformer';
import { AuditLogSeverity } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class ListAuditLogsQueryDto {
  @Type(() => String)
  @IsOptional()
  @IsString()
  fromDate?: string;

  @Type(() => String)
  @IsOptional()
  @IsString()
  toDate?: string;

  @Type(() => String)
  @IsOptional()
  @IsString()
  actorUserId?: string;

  @Type(() => String)
  @IsOptional()
  @IsString()
  entityType?: string;

  @Type(() => String)
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsEnum(AuditLogSeverity)
  severity?: AuditLogSeverity;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  normalize() {
    this.fromDate = normalizeOptionalString(this.fromDate);
    this.toDate = normalizeOptionalString(this.toDate);
    this.actorUserId = normalizeOptionalString(this.actorUserId);
    this.entityType = normalizeOptionalString(this.entityType);
    this.action = normalizeOptionalString(this.action);
    return this;
  }
}
