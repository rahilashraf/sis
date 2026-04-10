import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsString, Min } from 'class-validator';

export class CreateReportingPeriodDto {
  @IsString()
  schoolId: string;

  @IsString()
  schoolYearId: string;

  @IsString()
  name: string;

  @IsString()
  key: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  order: number;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;
}
