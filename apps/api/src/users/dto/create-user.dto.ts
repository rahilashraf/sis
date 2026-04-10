import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export enum AppUserRole {
  OWNER = 'OWNER',
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
  STAFF = 'STAFF',
  SUPPLY_TEACHER = 'SUPPLY_TEACHER',
  PARENT = 'PARENT',
  STUDENT = 'STUDENT',
}

export class CreateUserDto {
  @IsString()
  username: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEnum(AppUserRole)
  role: AppUserRole;

  @IsOptional()
  @IsString()
  schoolId?: string;
}
