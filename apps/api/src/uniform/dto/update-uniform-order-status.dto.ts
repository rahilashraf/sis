import { Transform } from 'class-transformer';
import { UniformOrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { toNullableTrimmedString } from './shared';

export class UpdateUniformOrderStatusDto {
  @IsEnum(UniformOrderStatus)
  status: UniformOrderStatus;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  internalNotes?: string | null;
}
