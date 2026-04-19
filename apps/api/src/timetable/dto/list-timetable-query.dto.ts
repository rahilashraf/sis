import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const timetableDayOfWeekValues = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

type TimetableDayOfWeekValue = (typeof timetableDayOfWeekValues)[number];

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class ListTimetableQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @Type(() => String)
  @IsOptional()
  @IsString()
  schoolId?: string;

  @Type(() => String)
  @IsOptional()
  @IsString()
  schoolYearId?: string;

  @Type(() => String)
  @IsOptional()
  @IsString()
  teacherId?: string;

  @Type(() => String)
  @IsOptional()
  @IsString()
  classId?: string;

  @Type(() => String)
  @IsOptional()
  @IsString()
  roomLabel?: string;

  @IsOptional()
  @IsIn(timetableDayOfWeekValues)
  dayOfWeek?: TimetableDayOfWeekValue;

  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

  normalize() {
    this.schoolId = normalizeOptionalString(this.schoolId);
    this.schoolYearId = normalizeOptionalString(this.schoolYearId);
    this.teacherId = normalizeOptionalString(this.teacherId);
    this.classId = normalizeOptionalString(this.classId);
    this.roomLabel = normalizeOptionalString(this.roomLabel);
    return this;
  }
}
