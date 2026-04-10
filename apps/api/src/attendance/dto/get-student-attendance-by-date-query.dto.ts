import { IsDateString } from 'class-validator';

export class GetStudentAttendanceByDateQueryDto {
  @IsDateString()
  date: string;
}
