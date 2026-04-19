import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  gradeLevelId?: string;

  @IsOptional()
  @IsString()
  subjectOptionId?: string;

  @IsOptional()
  @IsBoolean()
  isHomeroom?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
