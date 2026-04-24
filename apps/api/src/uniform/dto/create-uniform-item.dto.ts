import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  toNullableTrimmedString,
  toOptionalNumber,
  toOptionalStringArray,
  toTrimmedString,
} from './shared';

export class CreateUniformItemDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @MaxLength(200)
  name: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string | null;

  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'price must be a positive number with at most 2 decimal places',
  })
  price: string;

  @Transform(({ value }) => toOptionalStringArray(value))
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableSizes?: string[];

  @Transform(({ value }) => toOptionalStringArray(value))
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableColors?: string[];

  @Transform(({ value }) => toOptionalNumber(value))
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
