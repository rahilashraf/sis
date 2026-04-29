import { Transform } from 'class-transformer';
import { IsEnum, IsString } from 'class-validator';

export enum DataImportEntityType {
  STUDENTS = 'students',
  PARENTS = 'parents',
  USERS = 'users',
  CLASSES = 'classes',
  LIBRARY_ITEMS = 'library-items',
}

export enum DataImportDuplicateStrategy {
  FAIL = 'fail',
  SKIP = 'skip',
}

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class DataImportDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @IsEnum(DataImportEntityType)
  entityType: DataImportEntityType;

  @IsEnum(DataImportDuplicateStrategy)
  duplicateStrategy: DataImportDuplicateStrategy;

  @Transform(({ value }) => (typeof value === 'string' ? value : ''))
  @IsString()
  csvContent: string;
}
