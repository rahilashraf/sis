import { IsOptional, IsString } from 'class-validator';

export class UpdateGradeScaleDto {
  @IsOptional()
  @IsString()
  name?: string;
}

