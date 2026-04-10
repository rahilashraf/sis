import { IsDateString, IsOptional } from 'class-validator';

export class GetStudentSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
