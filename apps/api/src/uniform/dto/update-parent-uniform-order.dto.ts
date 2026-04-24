import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { toNullableTrimmedString } from './shared';
import { CreateUniformOrderItemDto } from './create-uniform-order.dto';

export class UpdateParentUniformOrderDto {
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
