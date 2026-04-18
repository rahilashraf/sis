import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class ReplaceEnrollmentSubjectsDto {
  @IsArray()
  @ArrayUnique()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((entry) =>
          typeof entry === 'string' ? toTrimmedString(entry) : entry,
        )
      : value,
  )
  @IsString({ each: true })
  subjectOptionIds: string[];
}
