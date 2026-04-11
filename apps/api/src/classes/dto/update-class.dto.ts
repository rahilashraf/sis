import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsBoolean()
  isHomeroom?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
