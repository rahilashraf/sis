import { IsString } from 'class-validator';

export class QueryReportingPeriodsDto {
  @IsString()
  schoolId: string;

  @IsString()
  schoolYearId: string;
}
