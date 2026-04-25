import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsArray,
  MaxLength,
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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  username: string;

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  firstName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  lastName: string;

  @IsEnum(AppUserRole)
  role: AppUserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @Transform(({ value }) => {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  schoolIds?: string[];
}
