import { Transform } from 'class-transformer';
import { IsIn, IsString } from 'class-validator';
import { ROLE_PERMISSION_TARGET_ROLES } from '../role-permissions.constants';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : value;
}

export class GetRolePermissionsQueryDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId!: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsIn(ROLE_PERMISSION_TARGET_ROLES)
  role!: (typeof ROLE_PERMISSION_TARGET_ROLES)[number];
}
