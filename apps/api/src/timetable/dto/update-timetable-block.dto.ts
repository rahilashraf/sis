import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
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

const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdateTimetableBlockDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsIn(timetableDayOfWeekValues)
  dayOfWeek?: TimetableDayOfWeekValue;

  @IsOptional()
  @IsString()
  @Matches(hhmmRegex, { message: 'startTime must be HH:mm' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(hhmmRegex, { message: 'endTime must be HH:mm' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roomLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  classIds?: string[];
}
