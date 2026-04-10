import { IsOptional, IsString } from 'class-validator';

export class PeriodKeyQueryDto {
  @IsOptional()
  @IsString()
  periodKey?: string;
}
