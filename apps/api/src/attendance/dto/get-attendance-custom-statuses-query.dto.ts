import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class GetAttendanceCustomStatusesQueryDto {
  @IsString()
  schoolId: string;

  @IsOptional()
  @IsBooleanString()
  includeInactive?: string;
}
