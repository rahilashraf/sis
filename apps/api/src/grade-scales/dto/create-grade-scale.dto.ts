import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateGradeScaleDto {
  @IsString()
  schoolId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

