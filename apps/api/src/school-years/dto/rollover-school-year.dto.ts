import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class RolloverSchoolYearDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  sourceSchoolYearId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  targetSchoolYearName: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsDateString()
  targetStartDate: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsDateString()
  targetEndDate: string;

  @IsOptional()
  @IsBoolean()
  copyGradeLevels?: boolean;

  @IsOptional()
  @IsBoolean()
  copyClassTemplates?: boolean;

  @IsOptional()
  @IsBoolean()
  promoteStudents?: boolean;

  @IsOptional()
  @IsBoolean()
  graduateFinalGradeStudents?: boolean;

  @IsOptional()
  @IsBoolean()
  archivePriorYearLeftovers?: boolean;

  @IsOptional()
  @IsBoolean()
  activateTargetSchoolYear?: boolean;
}
