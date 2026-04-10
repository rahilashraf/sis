import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class GetAttendanceStudentsQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  classIds: string[];
}
