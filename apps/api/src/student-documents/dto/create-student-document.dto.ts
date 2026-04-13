import { Transform, Type } from 'class-transformer';
import {
  StudentDocumentType,
  StudentDocumentVisibility,
} from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

function toNullableTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class CreateStudentDocumentDto {
  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsEnum(StudentDocumentType)
  type!: StudentDocumentType;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsEnum(StudentDocumentVisibility)
  visibility?: StudentDocumentVisibility | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  label?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsString()
  fileName!: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsString()
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSize!: number;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsString()
  storagePath!: string;
}
