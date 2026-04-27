import { IsBoolean } from 'class-validator';

export class UpdateAuditSettingsDto {
  @IsBoolean()
  enabled!: boolean;
}
