import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSchoolFeatureTogglesDto {
  @IsOptional()
  @IsBoolean()
  INCIDENT_REPORTS?: boolean;

  @IsOptional()
  @IsBoolean()
  ATTENDANCE?: boolean;

  @IsOptional()
  @IsBoolean()
  GRADEBOOK?: boolean;

  @IsOptional()
  @IsBoolean()
  FORMS?: boolean;

  @IsOptional()
  @IsBoolean()
  RE_REGISTRATION?: boolean;

  @IsOptional()
  @IsBoolean()
  BILLING?: boolean;

  @IsOptional()
  @IsBoolean()
  LIBRARY?: boolean;

  @IsOptional()
  @IsBoolean()
  UNIFORM_ORDERS?: boolean;

  @IsOptional()
  @IsBoolean()
  NOTIFICATIONS?: boolean;

  @IsOptional()
  @IsBoolean()
  ANNOUNCEMENTS?: boolean;
}
