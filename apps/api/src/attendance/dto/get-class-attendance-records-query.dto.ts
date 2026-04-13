import { IsDateString } from 'class-validator';

export class GetClassAttendanceRecordsQueryDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
