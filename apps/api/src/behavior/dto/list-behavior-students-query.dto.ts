import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class ListBehaviorStudentsQueryDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  query?: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
