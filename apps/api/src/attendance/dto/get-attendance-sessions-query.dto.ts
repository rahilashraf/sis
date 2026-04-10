import { IsDateString, IsString } from 'class-validator';

export class GetAttendanceSessionsQueryDto {
  @IsString()
  schoolId: string;

  @IsDateString()
  date: string;
}
