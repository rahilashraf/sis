import { IsString } from 'class-validator';

export class GetAttendanceStatusRulesQueryDto {
  @IsString()
  schoolId: string;
}
