import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class UpdateReRegistrationWindowDto {
  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

