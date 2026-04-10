import { IsDateString } from 'class-validator';

export class GetStudentSummaryQueryDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
