import {
  ArrayMinSize,
  IsArray,
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

export class CreateTimetableBlockDto {
  @IsString()
  schoolId: string;

  @IsString()
  schoolYearId: string;

  @IsString()
  teacherId: string;

  @IsIn(timetableDayOfWeekValues)
  dayOfWeek: TimetableDayOfWeekValue;

  @IsString()
  @Matches(hhmmRegex, { message: 'startTime must be HH:mm' })
  startTime: string;

  @IsString()
  @Matches(hhmmRegex, { message: 'endTime must be HH:mm' })
  endTime: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roomLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  classIds: string[];
}
