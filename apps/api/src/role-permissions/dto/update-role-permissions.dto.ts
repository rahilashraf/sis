import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
} from '../role-permissions.constants';

export class RolePermissionEntryDto {
  @IsIn(PERMISSION_RESOURCES)
  resource!: (typeof PERMISSION_RESOURCES)[number];

  @IsIn(PERMISSION_ACTIONS)
  action!: (typeof PERMISSION_ACTIONS)[number];

  @IsBoolean()
  allowed!: boolean;
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionEntryDto)
  permissions!: RolePermissionEntryDto[];
}
