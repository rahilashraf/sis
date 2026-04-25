import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class DuplicateClassDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  targetSchoolId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  targetSchoolYearId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  targetName?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  targetGradeLevelId?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  targetSubjectOptionId?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  targetTeacherId?: string;

  @IsOptional()
  @IsBoolean()
  isHomeroom?: boolean;

  @IsOptional()
  @IsBoolean()
  takesAttendance?: boolean;

  @IsOptional()
  @IsBoolean()
  copyAssessmentCategories?: boolean;

  @IsOptional()
  @IsBoolean()
  copyAssessments?: boolean;
}
