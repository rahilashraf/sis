import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

function normalizeSchoolIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

export class ManageUserMembershipsDto {
  @Transform(({ value }) => normalizeSchoolIds(value))
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  schoolIds: string[];

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsOptional()
  @IsString()
  primarySchoolId?: string;
}
