import { Transform } from 'class-transformer';
import { TeacherClassAssignmentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

function toNullableTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class UpdateTeacherAssignmentDto {
  @IsOptional()
  @IsEnum(TeacherClassAssignmentType)
  assignmentType?: TeacherClassAssignmentType;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}
