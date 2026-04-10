import { IsDateString, IsString } from 'class-validator';

export class CreateSchoolYearDto {
  @IsString()
  schoolId: string;

  @IsString()
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
