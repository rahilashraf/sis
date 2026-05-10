import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSchoolGovernanceSettingsDto {
  @IsOptional()
  @IsBoolean()
  PARENT_CAN_VIEW_GRADES?: boolean;

  @IsOptional()
  @IsBoolean()
  PARENT_CAN_VIEW_ATTENDANCE?: boolean;

  @IsOptional()
  @IsBoolean()
  STUDENT_CAN_VIEW_GRADES?: boolean;

  @IsOptional()
  @IsBoolean()
  STUDENT_CAN_VIEW_ATTENDANCE?: boolean;
}
