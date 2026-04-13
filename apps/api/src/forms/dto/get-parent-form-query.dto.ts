import { IsOptional, IsString } from 'class-validator';

export class GetParentFormQueryDto {
  @IsOptional()
  @IsString()
  studentId?: string;
}
