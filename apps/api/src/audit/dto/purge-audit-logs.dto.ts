import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PurgeAuditLogsDto {
  @IsString()
  fromDate: string;

  @IsString()
  toDate: string;

  @IsString()
  confirmationText: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedRowCount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
