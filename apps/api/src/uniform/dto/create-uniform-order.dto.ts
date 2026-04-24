import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  toNullableTrimmedString,
  toTrimmedString,
} from './shared';

export class CreateUniformOrderItemDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  uniformItemId: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  selectedSize?: string | null;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  selectedColor?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateUniformOrderDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  studentId: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateUniformOrderItemDto)
  items: CreateUniformOrderItemDto[];
}
