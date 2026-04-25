import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateClassDto {
  @IsString()
  schoolId: string;

  @IsString()
  schoolYearId: string;

  @IsString()
  gradeLevelId: string;

  @IsString()
  subjectOptionId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  isHomeroom?: boolean;

  @IsOptional()
  @IsBoolean()
  takesAttendance?: boolean;
}
