import { IsDateString, IsOptional } from 'class-validator';

export class GetClassSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
