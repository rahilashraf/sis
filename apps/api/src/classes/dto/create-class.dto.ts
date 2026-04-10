import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateClassDto {
  @IsString()
  schoolId: string;

  @IsString()
  schoolYearId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsBoolean()
  isHomeroom?: boolean;
}