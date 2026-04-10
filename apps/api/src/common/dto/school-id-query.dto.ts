import { IsString } from 'class-validator';

export class SchoolIdQueryDto {
  @IsString()
  schoolId: string;
}
